import { autorizadoPeloCron, segredoDoCron } from "@/server/cron";
import { log } from "@/server/log";
import { materializarContasDoDia } from "@/server/materializar-contas";
import { notificarLembretesDoDia, type ClienteDeNotificacoes } from "@/server/notificar-lembretes";
import { configuracaoVapid, criarEnviadorWebPush } from "@/server/push";
import { criarClienteAdmin } from "@/server/supabase-admin";

// GET /api/cron/diario (AD-13): chamado todos os dias pelo Vercel Cron
// (`vercel.json`, `0 12 * * *` UTC = 09:00 em Brasília) com
// `Authorization: Bearer CRON_SECRET`. Sem o segredo certo responde 401 e não
// lê nem grava nada (o cliente do Supabase nem é criado).
//
// Faz duas coisas, nesta ordem:
// 1. Materializa as Contas manuais até o Mês atual + 12 (`materializarContasDoDia`, AD-15). Essa leitura também
//    mantém o projeto Supabase Free ativo.
// 2. Avisa os lembretes do dia pelo Web Push (`notificarLembretesDoDia`, História 7.5, FR-55): as mesmas funções
//    da Central de Avisos (`lembretesDasLinhas`), respeitando as preferências, com a chave inserida em
//    `lembretes_enviados` ANTES do envio. Roda mesmo que a materialização tenha falhado, e uma falha dele NUNCA
//    desfaz o que já foi gravado nem muda a resposta: a resposta continua sendo só a da materialização.
//
// O log leva só rota, status, duração e quantidades (AD-17), nunca Nomes, Valores, endpoints nem chaves. A resposta
// é mínima: `{ ok, quantidade }`.
//
// Falha (Defeito 6): o Cron da Vercel não tenta de novo e ninguém é avisado dentro do app. O rastro é a linha de log
// `cron.diario` de nível `error` (status 500, o código `cron.leitura_falhou` ou `cron.materializacao_falhou`, a
// `quantidade` criada e quantas Contas falharam em `falhas`), que aparece nos logs da Vercel e deixa a execução
// marcada como falha em Settings → Cron Jobs. Decisão: basta isso (sem tabela, sem rota nova e sem aviso no app);
// o dia seguinte refaz (o horizonte é de 12 Meses e a RPC é idempotente).

export const runtime = "nodejs";
export const maxDuration = 60;

const ROTA = "/api/cron/diario";

type Corpo = { ok: boolean; quantidade?: number; erro?: string };

function responder(status: number, corpo: Corpo, inicio: number, codigo: string, quantidade?: number, falhas?: number) {
  log("cron.diario", {
    nivel: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
    codigo,
    campos: {
      rota: ROTA,
      metodo: "GET",
      status_http: status,
      duracao_ms: Date.now() - inicio,
      ...(quantidade === undefined ? {} : { quantidade }),
      // Quantas Contas a RPC recusou: a linha de erro basta para o Rafael ver o tamanho da falha (Defeito 6).
      ...(falhas === undefined ? {} : { falhas }),
    },
  });
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * O aviso do sistema dos lembretes (7.5). Nunca lança e nunca muda a resposta do Cron: só registra contagens e
 * códigos. Sem as variáveis VAPID (Previews, CI, produção antes de o Rafael cadastrar), só pula, com um aviso.
 */
async function avisarLembretes(admin: ClienteDeNotificacoes, agora: Date): Promise<void> {
  try {
    const vapid = configuracaoVapid();
    const r = await notificarLembretesDoDia(admin, agora, vapid === null ? null : criarEnviadorWebPush(vapid));
    if (r.pulou !== null) {
      log("cron.diario.notificacoes", {
        nivel: r.pulou === "sem_inscricao" ? "info" : "warn",
        codigo: `cron.notificacao_${r.pulou}`,
        campos: { rota: ROTA },
      });
      return;
    }
    log("cron.diario.notificacoes", {
      nivel: r.falhas > 0 ? "warn" : "info",
      codigo: "cron.notificou",
      campos: {
        rota: ROTA,
        enviadas: r.enviadas,
        ignoradas: r.ignoradas,
        inscricoes_apagadas: r.inscricoesApagadas,
        falhas: r.falhas,
        // Só aparece quando houve (o aviso sai no próximo dia).
        ...(r.reagendadas > 0 ? { reagendadas: r.reagendadas } : {}),
      },
    });
  } catch {
    // Nada do erro vai para o log (poderia citar endpoint ou chave).
    log("cron.diario.notificacoes", { nivel: "warn", codigo: "cron.notificacao_excecao", campos: { rota: ROTA } });
  }
}

export async function GET(request: Request) {
  const inicio = Date.now();

  // Primeiro de tudo: sem o segredo certo, nada é criado, lido ou gravado.
  if (!autorizadoPeloCron(request.headers.get("authorization"), segredoDoCron())) {
    return responder(401, { ok: false, erro: "cron.nao_autorizado" }, inicio, "cron.nao_autorizado");
  }

  const admin = criarClienteAdmin();
  if (!admin) {
    return responder(503, { ok: false, erro: "cron.indisponivel" }, inicio, "cron.indisponivel");
  }

  const agora = new Date();
  const resultado = await materializarContasDoDia(admin, agora);

  // Contas que não deram para ler: avisa (só a contagem) e segue.
  if (resultado.ilegiveis > 0) {
    log("cron.diario.conta_ilegivel", {
      nivel: "warn",
      codigo: "cron.conta_ilegivel",
      campos: { rota: ROTA, quantidade: resultado.ilegiveis },
    });
  }

  // Depois da materialização (que já gravou): o aviso do sistema, sem poder desfazê-la nem derrubar o Cron.
  await avisarLembretes(admin, agora);

  if (!resultado.ok) {
    if (resultado.codigo === "cron.materializacao_falhou") {
      log("cron.diario.materializacao_falhou", {
        nivel: "error",
        codigo: resultado.codigo,
        campos: { rota: ROTA, falhas: resultado.falhas },
      });
    }
    return responder(
      500,
      { ok: false, erro: "cron.falhou", quantidade: resultado.quantidade },
      inicio,
      resultado.codigo,
      resultado.quantidade,
      resultado.falhas,
    );
  }

  return responder(200, { ok: true, quantidade: resultado.quantidade }, inicio, "cron.materializou", resultado.quantidade);
}
