// Um Supabase de mentira para os testes do aviso do sistema (História 7.5): guarda as tabelas em memória e responde
// `.from(t).select(colunas).eq().is().order().range()`, `.insert()` e `.delete().eq()` como o PostgREST, com a
// restrição única de `lembretes_enviados` (23505). Devolve SÓ as colunas pedidas no `select` (provar que nada além do
// necessário é lido) e registra tudo em `eventos`, na ordem, para provar "insere antes de enviar".

export type Linha = Record<string, unknown>;

export type OpcoesDoBancoFalso = {
  /** Tabelas que "não existem" (o merge saiu antes do `db push`): o PostgREST responde PGRST205. */
  semTabela?: string[];
  /** Tabelas cuja leitura falha com outro erro. */
  leituraFalha?: string[];
  /** Erro da inserção em `lembretes_enviados` (ex.: `{ code: "XX000" }`); a restrição única é sempre aplicada. */
  erroDaInsercao?: { code: string } | null;
  /** A inserção lança (rede). */
  insercaoLanca?: boolean;
  /** O `delete` de inscrições responde erro. */
  erroDoDelete?: boolean;
};

export type Evento =
  | { tipo: "leitura"; tabela: string; colunas: string; filtros: [string, unknown][]; faixa: [number, number] | null }
  | { tipo: "insercao"; tabela: string; linha: Linha }
  | { tipo: "delete"; tabela: string; filtros: [string, unknown][] }
  | { tipo: "envio" };

export function bancoFalso(tabelas: Record<string, Linha[]>, opcoes: OpcoesDoBancoFalso = {}) {
  const dados: Record<string, Linha[]> = Object.fromEntries(Object.entries(tabelas).map(([k, v]) => [k, [...v]]));
  const eventos: Evento[] = [];

  function consulta(tabela: string, operacao: "select" | "insert" | "delete", linhaNova?: Linha) {
    let colunas = "*";
    let faixa: [number, number] | null = null;
    const filtros: [string, unknown][] = [];

    function executar() {
      if (opcoes.semTabela?.includes(tabela)) {
        return { data: null, error: { code: "PGRST205", message: `tabela ${tabela} não achada` } };
      }
      const linhas = (dados[tabela] ??= []);
      const casa = (l: Linha) => filtros.every(([c, v]) => ((l[c] ?? null) as unknown) === v);

      if (operacao === "insert") {
        eventos.push({ tipo: "insercao", tabela, linha: linhaNova! });
        if (opcoes.insercaoLanca) throw new Error("rede caiu: segredo-do-endpoint");
        if (opcoes.erroDaInsercao) return { data: null, error: { ...opcoes.erroDaInsercao, message: "erro com nome=Lucas" } };
        const chave = (l: Linha) => `${l.owner_id}|${l.tipo}|${l.referencia}|${l.dia}`;
        if (tabela === "lembretes_enviados" && linhas.some((l) => chave(l) === chave(linhaNova!))) {
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        linhas.push({ id: `${tabela}-${linhas.length + 1}`, ...linhaNova! });
        return { data: null, error: null };
      }

      if (operacao === "delete") {
        eventos.push({ tipo: "delete", tabela, filtros: [...filtros] });
        if (opcoes.erroDoDelete) return { data: null, error: { code: "XX000", message: "falhou" } };
        dados[tabela] = linhas.filter((l) => !casa(l));
        return { data: null, error: null };
      }

      eventos.push({ tipo: "leitura", tabela, colunas, filtros: [...filtros], faixa });
      if (opcoes.leituraFalha?.includes(tabela)) return { data: null, error: { code: "XX000", message: "falhou" } };
      const pedidas = colunas.split(",").map((c) => c.trim());
      const dentro = linhas.filter(casa);
      const [de, ate] = faixa ?? [0, dentro.length];
      return {
        data: dentro.slice(de, ate + 1).map((l) => Object.fromEntries(pedidas.map((c) => [c, l[c] ?? null]))),
        error: null,
      };
    }

    const b = {
      select(c: string) {
        colunas = c;
        return b;
      },
      eq(c: string, v: unknown) {
        filtros.push([c, v]);
        return b;
      },
      is(c: string, v: unknown) {
        filtros.push([c, v]);
        return b;
      },
      order() {
        return b;
      },
      range(de: number, ate: number) {
        faixa = [de, ate];
        return b;
      },
      then<R1, R2>(ok: (v: unknown) => R1, falha: (e: unknown) => R2) {
        try {
          return Promise.resolve(executar()).then(ok, falha);
        } catch (erro) {
          return Promise.reject(erro).then(ok, falha);
        }
      },
    };
    return b;
  }

  const cliente = {
    from(tabela: string) {
      return {
        select: (c: string) => consulta(tabela, "select").select(c),
        insert: (linha: Linha) => consulta(tabela, "insert", linha),
        delete: () => consulta(tabela, "delete"),
      };
    },
  };

  return { cliente, dados, eventos };
}
