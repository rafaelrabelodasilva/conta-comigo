import { describe, expect, it } from "vitest";
import {
  CORES_PESSOA,
  ativos,
  chaveDoNome,
  coresLivres,
  moverResponsavel,
  nomeDaCor,
  ordenarParaConfiguracoes,
  podeMover,
  proximaCor,
  proximaOrdem,
  validarDesarquivar,
  validarNome,
  type Responsavel,
} from "./responsaveis";

const r = (id: string, nome: string, cor: number, ordem: number, arquivado = false): Responsavel => ({
  id,
  nome,
  cor,
  ordem,
  arquivado,
});

const lista = [
  r("a", "Rafael", 1, 1),
  r("b", "Rangel", 5, 2),
  r("c", "Mãe", 3, 3),
  r("x", "Vó", 2, 4, true),
];

describe("CORES_PESSOA", () => {
  it("são as 8 cores, de 1 a 8, cada uma com nome", () => {
    expect(CORES_PESSOA.map((c) => c.cor)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(CORES_PESSOA.map((c) => c.nome)).size).toBe(8);
    expect(nomeDaCor(1)).toBe("Azul");
    expect(nomeDaCor(9)).toBeUndefined();
  });
});

describe("validarNome", () => {
  it("devolve o nome sem espaços nas pontas", () => {
    expect(validarNome("  Lucas ", lista)).toEqual({ ok: true, valor: "Lucas" });
  });

  it("recusa vazio", () => {
    for (const nome of ["", "   "]) {
      expect(validarNome(nome, lista)).toEqual({
        ok: false,
        erro: { codigo: "responsavel.nome_vazio" },
      });
    }
  });

  it("aceita 30 caracteres e recusa 31", () => {
    expect(validarNome("a".repeat(30), lista).ok).toBe(true);
    expect(validarNome("a".repeat(31), lista)).toEqual({
      ok: false,
      erro: { codigo: "responsavel.nome_longo" },
    });
  });

  it("recusa repetido sem diferenciar maiúsculas e acentos", () => {
    for (const nome of ["rafael", "MAE", " mãe ", "RanGel"]) {
      expect(validarNome(nome, lista)).toEqual({
        ok: false,
        erro: { codigo: "responsavel.nome_repetido" },
      });
    }
  });

  it("não compara com arquivados nem consigo mesmo", () => {
    expect(validarNome("vo", lista).ok).toBe(true);
    expect(validarNome("RAFAEL", lista, "a")).toEqual({ ok: true, valor: "RAFAEL" });
  });

  it("conta caracteres como o banco (emoji vale 1)", () => {
    const nome = "😀".repeat(30);
    expect(nome.length).toBe(60);
    expect(validarNome(nome, lista)).toEqual({ ok: true, valor: nome });
    expect(validarNome("😀".repeat(31), lista).ok).toBe(false);
  });

  it("chaveDoNome colapsa espaços", () => {
    expect(chaveDoNome("  Mãe   Ana ")).toBe("mae ana");
  });
});

describe("cores", () => {
  it("arquivado continua com a cor reservada", () => {
    expect(coresLivres(lista)).toEqual([4, 6, 7, 8]);
  });

  it("a própria cor conta como livre para quem a tem", () => {
    expect(coresLivres(lista, "a")).toEqual([1, 4, 6, 7, 8]);
  });

  it("próxima cor é a primeira livre", () => {
    expect(proximaCor(lista)).toEqual({ ok: true, valor: 4 });
    expect(proximaCor([])).toEqual({ ok: true, valor: 1 });
  });

  it("com as 8 em uso, não há próxima cor", () => {
    const cheia = CORES_PESSOA.map((c, i) => r(`r${i}`, `N${i}`, c.cor, i + 1, i === 7));
    expect(proximaCor(cheia)).toEqual({
      ok: false,
      erro: { codigo: "responsavel.sem_cor_livre" },
    });
  });
});

describe("ordem", () => {
  it("nova ordem é a maior + 1 (arquivados incluídos)", () => {
    expect(proximaOrdem(lista)).toBe(5);
    expect(proximaOrdem([])).toBe(1);
  });

  it("ativos tira os arquivados e ordena", () => {
    const embaralhada = [lista[2], lista[3], lista[0], lista[1]];
    expect(ativos(embaralhada).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("empate na ordem desempata pelo nome", () => {
    expect(ativos([r("1", "Zé", 1, 1), r("2", "Ana", 2, 1)]).map((x) => x.nome)).toEqual([
      "Ana",
      "Zé",
    ]);
  });

  it("Configurações mostra os arquivados no fim", () => {
    const comArquivadoNoMeio = [r("z", "Arq", 7, 0, true), ...lista];
    expect(ordenarParaConfiguracoes(comArquivadoNoMeio).map((x) => x.id)).toEqual([
      "a",
      "b",
      "c",
      "z",
      "x",
    ]);
  });
});

describe("moverResponsavel", () => {
  it("sobe e desce uma posição", () => {
    expect(moverResponsavel(lista, "b", "cima")).toEqual({ ok: true, valor: ["b", "a", "c"] });
    expect(moverResponsavel(lista, "b", "baixo")).toEqual({ ok: true, valor: ["a", "c", "b"] });
  });

  it("primeiro não sobe, último não desce, arquivado não move", () => {
    const erro = { ok: false, erro: { codigo: "responsavel.nao_move" } };
    expect(moverResponsavel(lista, "a", "cima")).toEqual(erro);
    expect(moverResponsavel(lista, "c", "baixo")).toEqual(erro);
    expect(moverResponsavel(lista, "x", "cima")).toEqual(erro);
    expect(moverResponsavel(lista, "nao-existe", "baixo")).toEqual(erro);
  });

  it("podeMover diz o mesmo que moverResponsavel", () => {
    expect(podeMover(lista, "a")).toEqual({ cima: false, baixo: true });
    expect(podeMover(lista, "b")).toEqual({ cima: true, baixo: true });
    expect(podeMover(lista, "c")).toEqual({ cima: true, baixo: false });
    expect(podeMover(lista, "x")).toEqual({ cima: false, baixo: false });
  });
});

describe("validarDesarquivar", () => {
  it("devolve a ordem nova (a maior + 1)", () => {
    expect(validarDesarquivar(lista, "x")).toEqual({ ok: true, valor: 5 });
  });

  it("recusa se o nome repete o de um ativo", () => {
    const comRepetido = [...lista, r("y", "RAFAEL", 8, 6, true)];
    expect(validarDesarquivar(comRepetido, "y")).toEqual({
      ok: false,
      erro: { codigo: "responsavel.nome_repetido" },
    });
  });

  it("recusa quem não está arquivado ou não existe", () => {
    const erro = { ok: false, erro: { codigo: "responsavel.nao_arquivado" } };
    expect(validarDesarquivar(lista, "a")).toEqual(erro);
    expect(validarDesarquivar(lista, "nada")).toEqual(erro);
  });
});
