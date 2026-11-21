import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/data/database.types";
import { hojeEmSaoPaulo } from "@/domain/datas";
import {
  TIPOS_DE_LEMBRETE,
  deveTentarDeNovoAmanha,
  lembretesDasLinhas,
  lembretesParaNotificar,
  type ChaveDeNotificacao,
  type LinhasParaLembretes,
} from "@/domain/lembretes";
import { avisoDoLembrete } from "@/domain/mensagens";
import type { EnviarPush, InscricaoParaEnviar } from "./push";

// Aviso do sistema dos lembretes (História 7.5, FR-55, AD-13, AD-12, AD-10, AD-17). Roda no Cron diário, DEPOIS da
// materialização das Contas manuais, com a chave de serviço (ignora o RLS; por isso cada leitura filtra o dono).
//
// A regra NÃO mora aqui. Este arquivo só lê, chama o núcleo e envia:
//   - `lembretesDasLinhas` (as mesmas funções e o mesmo contexto da Central de Avisos) diz quais lembretes existem hoje,
//     respeitando `configuracoes.lembrete_fechamento` e `lembrete_atraso`;
//   - `lembretesParaNotificar` diz quais saem como aviso e com que chave (`tipo, referencia, dia`).
//
// Garantias:
//   1. Nunca duas vezes: a chave é INSERIDA em `lembretes_enviados` (única) ANTES de enviar, e quem não conseguir
//      inserir não envia (23505 = outra execução ou outro dia já avisou).
//   2. Sem aparelho inscrito não grava nada (senão o aviso do dia ficaria "gasto" e quem ativa as notificações à
//      tarde nunca o receberia). Idem se todas as inscrições acabarem no meio.
//   3. A inscrição que o serviço de push recusa com 404 ou 410 é apagada.
//   4. Se NENHUM aparelho aceitou e ao menos uma falha foi transitória (rede, 5xx, 429), a linha de
//      `lembretes_enviados` é APAGADA e o Cron do dia seguinte tenta de novo (`deveTentarDeNovoAmanha`, no núcleo;
//      Defeito 7, que revê a decisão 3 da 7.5). Se um aparelho aceitou, ou o erro foi 401, 403, 404 ou 410, a linha
//      fica ("nunca duas vezes" continua valendo para quem recebeu). A Central de Avisos segue sendo o canal.
//   5. Falhar aqui nunca desfaz a materialização nem vira 500: devolve contagens e a rota só registra.
//
// O texto do aviso é o da Central (`avisoDoLembrete`, `mensagens.ts`). Nada daqui vai para log: nem o `endpoint`, nem as
// chaves, nem o texto, nem nomes de Bloco, nem valores. Só as contagens do resultado.

export type ClienteDeNotificacoes = Pick<SupabaseClient<Database>, "from">;

/** Por que o aviso do sistema nem começou (a rota registra só o código). */
export type MotivoDeNaoNotificar = "sem_chaves" | "sem_tabela" | "sem_inscricao" | "leitura_falhou";

export type ResultadoDasNotificacoes = {
  /** Preenchido quando nada foi tentado; as contagens vêm zeradas. */
  pulou: MotivoDeNaoNotificar | null;
  /** Lembretes que ao menos um aparelho aceitou. */
  enviadas: number;
  /** Lembretes cuja chave já existia em `lembretes_enviados`: não saem de novo. */
  ignoradas: number;
  /** Inscrições apagadas por 404 ou 410. */
  inscricoesApagadas: number;
  /** Envios recusados por outro motivo, e leituras ou gravações que falharam (nada vai para o log além disso). */
  falhas: number;
  /** Lembretes cuja chave foi apagada porque nenhum aparelho aceitou e o erro foi transitório: saem no próximo dia. */
  reagendadas: number;
};

const ZERO = { enviadas: 0, ignoradas: 0, inscricoesApagadas: 0, falhas: 0, reagendadas: 0 } as const;

const pulou = (motivo: MotivoDeNaoNotificar): ResultadoDasNotificacoes => ({ pulou: motivo, ...ZERO });

/** O limite de uma resposta do PostgREST; a leitura segue por páginas até uma vir incompleta. */
const TAMANHO_DA_PAGINA = 1000;

/** Depois disto, nenhum aviso novo começa (o Cron tem `maxDuration = 60`); o que sobrar sai no próximo dia. */
export const PRAZO_DOS_AVISOS_EM_MS = 40_000;

const LANCAMENTOS =
  "id, mes, valor_centavos, status_id, excluido_em, lancado_por, conta_manual_id, dividido_de_id, divisao, ajuste_de_id, vencimento_combinado, responsavel_id, tipo_id";
const ITENS = "lancamento_id, valor_centavos, status_aplicado_id, excluido_em";
const BLOCOS = "id, nome, formula, ordem, de_cobranca, meu_bloco";
const CICLO = "dia_fechamento, dia_vencimento, vigente_desde, created_at";

type ErroDoBanco = { code?: string } | null;
type Pagina<T> = PromiseLike<{ data: T[] | null; error: ErroDoBanco }>;
type Leitura<T> = { ok: true; linhas: T[] } | { ok: false; ausente: boolean };

/** A tabela ainda não existe (o merge saiu antes do `db push`): Postgres 42P01 ou PostgREST PGRST205. */
function tabelaAusente(erro: ErroDoBanco): boolean {
  return erro?.code === "42P01" || erro?.code === "PGRST205";
}

/** Lê uma tabela inteira, de 1000 em 1000. Nunca lança. */
async function lerTudo<T>(pagina: (de: number, ate: number) => Pagina<T>): Promise<Leitura<T>> {
  try {
    const linhas: T[] = [];
    for (let de = 0; ; de += TAMANHO_DA_PAGINA) {
      const resposta = await pagina(de, de + TAMANHO_DA_PAGINA - 1);
      if (resposta.error || !Array.isArray(resposta.data)) return { ok: false, ausente: tabelaAusente(resposta.error) };
      linhas.push(...resposta.data);
      if (resposta.data.length < TAMANHO_DA_PAGINA) return { ok: true, linhas };
    }
  } catch {
    return { ok: false, ausente: false };
  }
}

type DadosDoDono = { linhas: LinhasParaLembretes; enviados: ChaveDeNotificacao[] };

/** As linhas que o núcleo precisa para o dono, com as mesmas colunas e filtros da Central. `null` se algo não leu. */
async function lerDoDono(admin: ClienteDeNotificacoes, dono: string): Promise<DadosDoDono | null> {
  const [lancamentos, itens, blocos, status, faturas, ciclo, configuracoes, enviados] = await Promise.all([
    lerTudo((a, b) => admin.from("lancamentos").select(LANCAMENTOS).eq("owner_id", dono).order("id").range(a, b)),
    lerTudo((a, b) =>
      admin.from("pagamento_itens").select(ITENS).eq("owner_id", dono).is("excluido_em", null).order("id").range(a, b),
    ),
    lerTudo((a, b) =>
      admin.from("blocos").select(BLOCOS).eq("owner_id", dono).eq("de_cobranca", true).order("id").range(a, b),
    ),
    lerTudo((a, b) => admin.from("status").select("id, conta_como_pago").eq("owner_id", dono).order("id").range(a, b)),
    lerTudo((a, b) => admin.from("faturas").select("mes, vencimento").eq("owner_id", dono).order("id").range(a, b)),
    lerTudo((a, b) => admin.from("config_ciclo").select(CICLO).eq("owner_id", dono).order("id").range(a, b)),
    lerTudo((a, b) =>
      admin
        .from("configuracoes")
        .select("lembrete_fechamento, lembrete_atraso, tolerancia_atraso_dias")
        .eq("owner_id", dono)
        .order("id")
        .range(a, b),
    ),
    lerTudo((a, b) =>
      admin.from("lembretes_enviados").select("tipo, referencia, dia").eq("owner_id", dono).order("id").range(a, b),
    ),
  ]);
  if (
    !lancamentos.ok ||
    !itens.ok ||
    !blocos.ok ||
    !status.ok ||
    !faturas.ok ||
    !ciclo.ok ||
    !configuracoes.ok ||
    !enviados.ok
  ) {
    return null;
  }
  const tipos: readonly string[] = TIPOS_DE_LEMBRETE;
  return {
    linhas: {
      ciclo: ciclo.linhas,
      lancamentos: lancamentos.linhas,
      blocos: blocos.linhas,
      status: status.linhas,
      itens: itens.linhas,
      faturas: faturas.linhas,
      configuracao: configuracoes.linhas[0] ?? null,
    },
    enviados: enviados.linhas.flatMap((l) =>
      tipos.includes(l.tipo) ? [{ tipo: l.tipo as ChaveDeNotificacao["tipo"], referencia: l.referencia, dia: l.dia }] : [],
    ),
  };
}

/**
 * Avisa, pelo Web Push, os lembretes do dia que ainda não saíram. `enviar` é a porta de envio (`null` = sem chaves
 * VAPID neste ambiente: só pula). Nunca lança e nunca devolve nem registra texto, endpoint, chave, nome ou valor.
 */
export async function notificarLembretesDoDia(
  admin: ClienteDeNotificacoes,
  agora: Date,
  enviar: EnviarPush | null,
  prazoEmMs: number = Date.now() + PRAZO_DOS_AVISOS_EM_MS,
): Promise<ResultadoDasNotificacoes> {
  if (enviar === null) return pulou("sem_chaves");

  const inscricoes = await lerTudo((a, b) =>
    admin.from("push_inscricoes").select("id, owner_id, endpoint, chave_p256dh, chave_auth").order("id").range(a, b),
  );
  if (!inscricoes.ok) return pulou(inscricoes.ausente ? "sem_tabela" : "leitura_falhou");
  if (inscricoes.linhas.length === 0) return pulou("sem_inscricao");

  const porDono = new Map<string, (InscricaoParaEnviar & { id: string })[]>();
  for (const { owner_id, ...inscricao } of inscricoes.linhas) {
    porDono.set(owner_id, [...(porDono.get(owner_id) ?? []), inscricao]);
  }

  const hoje = hojeEmSaoPaulo(agora);
  const resultado = { ...ZERO };

  for (const [dono, todas] of porDono) {
    const dados = await lerDoDono(admin, dono);
    if (dados === null) {
      resultado.falhas += 1;
      continue;
    }
    let vivas = todas;
    for (const notificacao of lembretesParaNotificar(lembretesDasLinhas(hoje, dados.linhas), dados.enviados)) {
      // Sem aparelho (todos recusaram no meio) ou sem tempo: nada é gravado, e o que sobrar sai no próximo dia.
      if (vivas.length === 0 || Date.now() > prazoEmMs) break;

      // 1) Inserir ANTES de enviar; quem não conseguir inserir não envia.
      try {
        const { error } = await admin.from("lembretes_enviados").insert({
          owner_id: dono,
          tipo: notificacao.tipo,
          referencia: notificacao.referencia,
          dia: notificacao.dia,
        });
        if (error) {
          if (error.code === "23505") resultado.ignoradas += 1;
          else resultado.falhas += 1;
          continue;
        }
      } catch {
        resultado.falhas += 1;
        continue;
      }

      // 2) Enviar a cada aparelho; apagar o que o serviço de push diz que acabou (404 ou 410).
      const corpo = JSON.stringify(avisoDoLembrete(notificacao.lembrete));
      let aceito = false;
      const envios: Awaited<ReturnType<EnviarPush>>[] = [];
      for (const inscricao of [...vivas]) {
        let envio: Awaited<ReturnType<EnviarPush>>;
        try {
          envio = await enviar(inscricao, corpo);
        } catch {
          envio = { ok: false, status: null };
        }
        envios.push(envio);
        if (envio.ok) {
          aceito = true;
        } else if (envio.status === 404 || envio.status === 410) {
          vivas = vivas.filter((v) => v.id !== inscricao.id);
          try {
            const { error } = await admin.from("push_inscricoes").delete().eq("id", inscricao.id);
            if (error) resultado.falhas += 1;
            else resultado.inscricoesApagadas += 1;
          } catch {
            resultado.falhas += 1;
          }
        } else {
          resultado.falhas += 1;
        }
      }
      if (aceito) resultado.enviadas += 1;

      // 3) Nenhum aparelho aceitou e o erro foi transitório: solta a chave para o Cron de amanhã tentar de novo.
      if (deveTentarDeNovoAmanha(envios)) {
        try {
          const { error } = await admin
            .from("lembretes_enviados")
            .delete()
            .eq("owner_id", dono)
            .eq("tipo", notificacao.tipo)
            .eq("referencia", notificacao.referencia)
            .eq("dia", notificacao.dia);
          if (error) resultado.falhas += 1;
          else resultado.reagendadas += 1;
        } catch {
          resultado.falhas += 1;
        }
      }
    }
  }

  return { pulou: null, ...resultado };
}
