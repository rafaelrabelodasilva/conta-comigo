import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { criarRepoAvisos, type LinhaAvisoLido } from "./avisos-repo";
import type { Database } from "./database.types";
import { criarGerenciador } from "./realtime";

// O repositório dos avisos lidos (História 8.1): "marcar" é um upsert em lote que ignora o que já está lido,
// otimista, e "marcar tudo" é um pedido só. Sem rede: o cliente do Supabase é falso.

type Chamada = { tabela: string; corpo: Record<string, unknown>[]; opcoes: unknown };

const T1 = "2026-11-19T12:00:00+00:00";
const T2 = "2026-11-19T12:00:05+00:00";

const lida = (referencia: string, dia = "2026-11-17", extra: Partial<LinhaAvisoLido> = {}): LinhaAvisoLido => ({
  id: `lida-${referencia}`,
  owner_id: "dono",
  tipo: "atraso",
  referencia,
  dia,
  created_at: T1,
  updated_at: T1,
  ...extra,
});

const chave = (referencia: string, dia = "2026-11-17") => ({ tipo: "atraso", referencia, dia });

type Resposta = { data: unknown; error: unknown };

function montar(
  iniciais: LinhaAvisoLido[],
  responder: (c: Chamada) => Resposta | Promise<Resposta> = (c) => ({
    // O banco devolve só o que inseriu (`ignoreDuplicates`), já com dono e datas.
    data: c.corpo.map((l) => ({ ...l, owner_id: "dono", created_at: T2, updated_at: T2 })),
    error: null,
  }),
  online = () => true,
) {
  const chamadas: Chamada[] = [];
  const cliente = {
    from: (tabela: string) => ({
      select: async () => ({ data: iniciais, error: null }),
      upsert: (corpo: Record<string, unknown>[], opcoes: unknown) => {
        const c = { tabela, corpo, opcoes };
        chamadas.push(c);
        return { select: async () => responder(c) };
      },
    }),
    channel: () => ({
      on() {
        return this;
      },
      subscribe(cb: (s: string) => void) {
        cb("SUBSCRIBED");
        return this;
      },
    }),
  } as unknown as SupabaseClient<Database>;
  const memoria = criarGerenciador<LinhaAvisoLido>({ tabela: "avisos_lidos", obterCliente: () => cliente });
  let n = 0;
  const repo = criarRepoAvisos({ obterCliente: () => cliente, memoria, online, novoId: () => `novo-${++n}` });
  return { chamadas, memoria, repo };
}

async function pronto(m: ReturnType<typeof montar>) {
  m.memoria.assinar(() => {});
  await new Promise((r) => setTimeout(r, 0));
}

const chaves = (m: ReturnType<typeof montar>) => m.memoria.linhas().map((l) => `${l.tipo}|${l.referencia}|${l.dia}`).sort();

describe("repositório de avisos lidos: marcar um", () => {
  it("faz um upsert na chave única, ignorando duplicados, e deixa a linha do banco na memória", async () => {
    const m = montar([]);
    await pronto(m);
    expect(await m.repo.marcarUm(chave("lucas"))).toEqual({ ok: true });
    expect(m.chamadas).toEqual([
      {
        tabela: "avisos_lidos",
        corpo: [{ id: "novo-1", tipo: "atraso", referencia: "lucas", dia: "2026-11-17" }],
        opcoes: { onConflict: "owner_id,tipo,referencia,dia", ignoreDuplicates: true },
      },
    ]);
    expect(m.memoria.linhas()).toEqual([
      { id: "novo-1", owner_id: "dono", tipo: "atraso", referencia: "lucas", dia: "2026-11-17", created_at: T2, updated_at: T2 },
    ]);
  });

  it("é otimista: a linha já está na memória enquanto o banco não respondeu", async () => {
    let liberar: (r: Resposta) => void = () => {};
    const m = montar([], () => new Promise<Resposta>((r) => (liberar = r)));
    await pronto(m);
    const promessa = m.repo.marcarUm(chave("lucas"));
    expect(chaves(m)).toEqual(["atraso|lucas|2026-11-17"]);
    liberar({ data: [], error: null });
    expect(await promessa).toEqual({ ok: true });
  });

  it("não manda dono (o banco usa auth.uid()) nem datas", async () => {
    const m = montar([]);
    await pronto(m);
    await m.repo.marcarUm(chave("lucas"));
    expect(Object.keys(m.chamadas[0].corpo[0]).sort()).toEqual(["dia", "id", "referencia", "tipo"]);
  });

  it("o que já está lido não chama o banco", async () => {
    const m = montar([lida("lucas")]);
    await pronto(m);
    expect(await m.repo.marcarUm(chave("lucas"))).toEqual({ ok: true });
    expect(m.chamadas).toEqual([]);
  });

  it("o mesmo aviso com outro 'desde' é outro aviso: é gravado", async () => {
    const m = montar([lida("lucas", "2026-11-17")]);
    await pronto(m);
    expect(await m.repo.marcarUm(chave("lucas", "2026-12-17"))).toEqual({ ok: true });
    expect(m.chamadas).toHaveLength(1);
    expect(chaves(m)).toEqual(["atraso|lucas|2026-11-17", "atraso|lucas|2026-12-17"]);
  });

  it("o banco recusa: desfaz a linha otimista e responde 'salvar.falhou'", async () => {
    const m = montar([], () => ({ data: null, error: { message: "boom" } }));
    await pronto(m);
    expect(await m.repo.marcarUm(chave("lucas"))).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(chaves(m)).toEqual([]);
  });

  it("a tabela ainda não existe (entre o merge e o `db push`): erro do PostgREST desfaz e responde 'salvar.falhou'", async () => {
    const m = montar([], () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }));
    await pronto(m);
    expect(await m.repo.marcarUm(chave("lucas"))).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(chaves(m)).toEqual([]);
  });

  it("o banco lança: desfaz e responde 'salvar.falhou'", async () => {
    const m = montar([lida("ana")], () => {
      throw new Error("rede");
    });
    await pronto(m);
    expect(await m.repo.marcarUm(chave("lucas"))).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(chaves(m)).toEqual(["atraso|ana|2026-11-17"]);
  });

  it("sem conexão: nada é tentado, nem o otimismo", async () => {
    const m = montar([], undefined, () => false);
    await pronto(m);
    expect(await m.repo.marcarUm(chave("lucas"))).toEqual({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    expect(m.chamadas).toEqual([]);
    expect(chaves(m)).toEqual([]);
  });
});

describe("repositório de avisos lidos: marcar vários de uma vez", () => {
  it("'Marcar tudo' é UM pedido com todas as chaves", async () => {
    const m = montar([]);
    await pronto(m);
    expect(await m.repo.marcar([chave("a"), chave("b"), { tipo: "fechamento", referencia: "2026-11", dia: "2026-10-28" }])).toEqual({ ok: true });
    expect(m.chamadas).toHaveLength(1);
    expect(m.chamadas[0].corpo.map((l) => `${l.tipo}|${l.referencia}|${l.dia}`)).toEqual([
      "atraso|a|2026-11-17",
      "atraso|b|2026-11-17",
      "fechamento|2026-11|2026-10-28",
    ]);
    expect(chaves(m)).toHaveLength(3);
  });

  it("ignora o que já está lido e o que se repete na lista; grava só o que falta", async () => {
    const m = montar([lida("a")]);
    await pronto(m);
    await m.repo.marcar([chave("a"), chave("b"), chave("b"), chave("c")]);
    expect(m.chamadas[0].corpo.map((l) => l.referencia)).toEqual(["b", "c"]);
  });

  it("lista vazia ou só de lidos: não chama o banco e dá certo", async () => {
    const m = montar([lida("a")]);
    await pronto(m);
    expect(await m.repo.marcar([])).toEqual({ ok: true });
    expect(await m.repo.marcar([chave("a")])).toEqual({ ok: true });
    expect(m.chamadas).toEqual([]);
  });

  it("o banco recusa: desfaz TODAS as linhas otimistas e deixa as que já existiam", async () => {
    const m = montar([lida("a")], () => ({ data: null, error: { message: "boom" } }));
    await pronto(m);
    expect(await m.repo.marcar([chave("b"), chave("c")])).toEqual({ ok: false, codigo: "salvar.falhou" });
    expect(chaves(m)).toEqual(["atraso|a|2026-11-17"]);
  });

  it("corrida com outro aparelho (o banco ignora o duplicado e devolve menos linhas): dá certo", async () => {
    const m = montar([], (c) => ({
      data: [{ ...c.corpo[0], owner_id: "dono", created_at: T2, updated_at: T2 }],
      error: null,
    }));
    await pronto(m);
    expect(await m.repo.marcar([chave("a"), chave("b")])).toEqual({ ok: true });
    expect(chaves(m)).toEqual(["atraso|a|2026-11-17", "atraso|b|2026-11-17"]);
  });
});
