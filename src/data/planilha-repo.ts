// Repositório da planilha (História 3.10, FR-2, AD-3/4). Única porta de
// gravação do histórico importado: chama as RPCs `importar_aba_planilha` (uma
// aba por transação) e `apagar_historico_do_mes`, e lê do banco o que o núcleo
// precisa para planejar (o que o app já tem e os cadastros). Quem calcula é o
// núcleo (`domain/importacao-planilha`); aqui só se lê e se grava. As Regras
// iniciais passam por `regrasRepo.criarIniciais`.
//
// - `lerEstado()`: Meses com Fatura, Meses com histórico e os Lançamentos não
//   excluídos (Nome, Mês, parcela, origem e se foi editado), em páginas, para
//   o planejamento não repetir parcela nem previsto.
// - `lerCadastros()`: Responsáveis, Tipos e Status, arquivados incluídos.
// - `importarAba(plano)`: manda as linhas e os previstos de UMA aba. Os do Mês
//   aberto entram na memória e os apagados saem dela, sem esperar o Realtime.
//   Aba que só ensina Regras (Mês com Fatura) não chama a RPC.
// - `apagarHistorico(mes)`: o caminho de volta de uma importação.
//
// Falha não lança: devolve `{ ok: false, codigo }`.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CadastrosDoApp, EstadoDoApp, LinhaDoApp, PlanoDaAba } from "@/domain/importacao-planilha";
import type { Responsavel } from "@/domain/responsaveis";
import { estaOnline } from "./conexao";
import type { Database, Json } from "./database.types";
import { SEM_CONEXAO, type Online } from "./gravacao";
import { gerenciador, type Gerenciador, type LinhaDe } from "./realtime";
import { criarClienteNavegador } from "./supabase/navegador";

type LinhaLancamento = LinhaDe<"lancamentos">;

const PAGINA = 1000;

/** Códigos que as RPCs levantam e a tela mostra como estão. */
const CODIGOS_DA_RPC = new Set(["planilha.mes_com_fatura", "planilha.serie_ocupada", "auth.sessao_expirou", "salvar.falhou"]);

function codigoDoErro(erro: { message?: string } | null): string {
  const msg = erro?.message ?? "";
  for (const codigo of CODIGOS_DA_RPC) if (msg.includes(codigo)) return codigo;
  return "salvar.falhou";
}

export type ResultadoLerEstado = { ok: true; estado: EstadoDoApp } | { ok: false };
export type CadastrosLidos = { cadastros: CadastrosDoApp; responsaveis: Responsavel[] };
export type ResultadoLerCadastros = ({ ok: true } & CadastrosLidos) | { ok: false };
export type ResultadoImportarAba = { ok: true; lancamentos: number } | { ok: false; codigo: string };
export type ResultadoApagar = { ok: true; quantidade: number } | { ok: false; codigo: string };

type Gravada = {
  lancamentos: LinhaLancamento[];
  previstos: LinhaLancamento[];
  removidos: { lancamentos: string[]; previstos: string[] };
};

const ehLista = (v: unknown): v is unknown[] => Array.isArray(v);
const ehListaDeIds = (v: unknown): v is string[] => ehLista(v) && v.every((id) => typeof id === "string");

function ehGravada(d: unknown): d is Gravada {
  const g = d as Partial<Record<keyof Gravada, unknown>> | null;
  if (typeof g !== "object" || g === null) return false;
  const r = g.removidos as Partial<Gravada["removidos"]> | undefined;
  return ehLista(g.lancamentos) && ehLista(g.previstos) && typeof r === "object" && r !== null && ehListaDeIds(r.lancamentos) && ehListaDeIds(r.previstos);
}

export function criarRepoPlanilha(deps: {
  obterCliente: () => SupabaseClient<Database> | null;
  lancamentos: Gerenciador<LinhaLancamento>;
  online?: Online;
}) {
  const { obterCliente, lancamentos, online = estaOnline } = deps;

  return {
    async lerEstado(): Promise<ResultadoLerEstado> {
      const cliente = obterCliente();
      if (!cliente) return { ok: false };
      try {
        const faturas = await cliente.from("faturas").select("mes");
        if (faturas.error || !faturas.data) return { ok: false };
        const linhas: Pick<
          LinhaLancamento,
          "id" | "nome" | "mes" | "parcela_n" | "parcela_total" | "lancado_por" | "editado_em" | "origem_lancamento_id"
        >[] = [];
        for (let de = 0; ; de += PAGINA) {
          const { data, error } = await cliente
            .from("lancamentos")
            .select("id, nome, mes, parcela_n, parcela_total, lancado_por, editado_em, origem_lancamento_id")
            .is("excluido_em", null)
            .is("dividido_de_id", null)
            .order("id")
            .range(de, de + PAGINA - 1);
          if (error || !data) return { ok: false };
          linhas.push(...data);
          if (data.length < PAGINA) break;
        }
        const porId = new Map(linhas.map((l) => [l.id, l]));
        const doApp: LinhaDoApp[] = linhas.map((l) => {
          const origem = l.origem_lancamento_id === null ? undefined : porId.get(l.origem_lancamento_id);
          return {
            nome: l.nome,
            mes: l.mes,
            parcela_n: l.parcela_n,
            parcela_total: l.parcela_total,
            lancado_por: l.lancado_por,
            editado: l.editado_em !== null,
            origem_historico_mes: origem && origem.lancado_por === "historico" ? origem.mes : null,
          };
        });
        const comHistorico = [...new Set(linhas.filter((l) => l.lancado_por === "historico").map((l) => l.mes))].sort();
        return {
          ok: true,
          estado: { mesesComFatura: faturas.data.map((f) => f.mes), mesesComHistorico: comHistorico, linhas: doApp },
        };
      } catch {
        return { ok: false };
      }
    },

    async lerCadastros(): Promise<ResultadoLerCadastros> {
      const cliente = obterCliente();
      if (!cliente) return { ok: false };
      try {
        const [r, t, s] = await Promise.all([
          cliente.from("responsaveis").select("*"),
          cliente.from("tipos").select("*"),
          cliente.from("status").select("*"),
        ]);
        if (r.error || t.error || s.error || !r.data || !t.data || !s.data) return { ok: false };
        const ref = (l: { id: string; nome: string; arquivado: boolean }) => ({ id: l.id, nome: l.nome, arquivado: l.arquivado });
        return {
          ok: true,
          cadastros: { responsaveis: r.data.map(ref), tipos: t.data.map(ref), status: s.data.map(ref) },
          responsaveis: r.data.map((x) => ({ id: x.id, nome: x.nome, cor: x.cor, ordem: x.ordem, arquivado: x.arquivado })),
        };
      } catch {
        return { ok: false };
      }
    },

    /** Grava uma aba (uma transação). Aba só de Regras não grava nada. */
    async importarAba(plano: PlanoDaAba): Promise<ResultadoImportarAba> {
      if (plano.soRegras) return { ok: true, lancamentos: 0 };
      if (!online()) return { ok: false, codigo: SEM_CONEXAO.codigo };
      const cliente = obterCliente();
      if (!cliente) return { ok: false, codigo: "salvar.falhou" };
      try {
        const { data, error } = await cliente.rpc("importar_aba_planilha", {
          p_mes: plano.mes,
          p_linhas: plano.linhas as unknown as Json,
          p_previstos: plano.previstos as unknown as Json,
        });
        if (error) return { ok: false, codigo: codigoDoErro(error) };
        if (!ehGravada(data)) return { ok: false, codigo: "salvar.falhou" };
        lancamentos.remover([...data.removidos.lancamentos, ...data.removidos.previstos]);
        lancamentos.aplicarLote([...data.lancamentos, ...data.previstos]);
        return { ok: true, lancamentos: data.lancamentos.filter((l) => (l.dividido_de_id ?? null) === null).length };
      } catch {
        return { ok: false, codigo: "salvar.falhou" };
      }
    },

    /** Apaga só o histórico importado do Mês (e o que ele gerou sem edição). */
    async apagarHistorico(mes: string): Promise<ResultadoApagar> {
      if (!online()) return { ok: false, codigo: SEM_CONEXAO.codigo };
      const cliente = obterCliente();
      if (!cliente) return { ok: false, codigo: "salvar.falhou" };
      try {
        const { data, error } = await cliente.rpc("apagar_historico_do_mes", { p_mes: mes });
        if (error) return { ok: false, codigo: codigoDoErro(error) };
        const d = data as { lancamentos?: unknown; previstos?: unknown } | null;
        if (!d || !ehListaDeIds(d.lancamentos) || !ehListaDeIds(d.previstos)) return { ok: false, codigo: "salvar.falhou" };
        lancamentos.remover([...d.lancamentos, ...d.previstos]);
        return { ok: true, quantidade: d.lancamentos.length };
      } catch {
        return { ok: false, codigo: "salvar.falhou" };
      }
    },

    /** Os Meses que têm linhas `historico` (para "Apagar histórico importado"). */
    async mesesComHistorico(): Promise<{ ok: true; meses: { mes: string; quantidade: number }[] } | { ok: false }> {
      const cliente = obterCliente();
      if (!cliente) return { ok: false };
      try {
        const contagem = new Map<string, number>();
        for (let de = 0; ; de += PAGINA) {
          const { data, error } = await cliente
            .from("lancamentos")
            .select("mes")
            .eq("lancado_por", "historico")
            .is("excluido_em", null)
            .is("dividido_de_id", null)
            .order("id")
            .range(de, de + PAGINA - 1);
          if (error || !data) return { ok: false };
          for (const l of data) contagem.set(l.mes, (contagem.get(l.mes) ?? 0) + 1);
          if (data.length < PAGINA) break;
        }
        return { ok: true, meses: [...contagem].map(([mes, quantidade]) => ({ mes, quantidade })).sort((a, b) => (a.mes < b.mes ? -1 : 1)) };
      } catch {
        return { ok: false };
      }
    },
  };
}

export type RepoPlanilha = ReturnType<typeof criarRepoPlanilha>;

let repo: RepoPlanilha | null = null;

/** O repositório do navegador, ligado ao gerenciador de Lançamentos. */
export function repoPlanilha(): RepoPlanilha {
  repo ??= criarRepoPlanilha({
    obterCliente: () => criarClienteNavegador() as SupabaseClient<Database> | null,
    lancamentos: gerenciador("lancamentos"),
  });
  return repo;
}
