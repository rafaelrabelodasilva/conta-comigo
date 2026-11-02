import { describe, expect, it } from "vitest";
import {
  MENSAGENS,
  RESPOSTAS_PERGUNTA,
  ROTULOS,
  ehCodigoConhecido,
  mensagem,
} from "./mensagens";

describe("mensagem", () => {
  it("devolve o texto do código", () => {
    expect(mensagem("auth.credenciais_invalidas")).toBe(
      "E-mail ou senha incorretos.",
    );
    expect(mensagem("auth.sessao_expirou")).toBe(
      "Sua sessão expirou. Entre de novo.",
    );
    expect(mensagem("auth.indisponivel")).toBe(
      "Login indisponível neste ambiente.",
    );
  });

  it("cai na mensagem genérica para código desconhecido ou vazio", () => {
    const generica = MENSAGENS["erro.desconhecido"];
    expect(mensagem("nao.existe")).toBe(generica);
    expect(mensagem(null)).toBe(generica);
    expect(mensagem(undefined)).toBe(generica);
    expect(mensagem("toString")).toBe(generica);
    expect(mensagem("__proto__")).toBe(generica);
  });

  it("o erro de login não diz qual campo errou", () => {
    const texto = mensagem("auth.credenciais_invalidas");
    expect(texto).toMatch(/e-mail ou senha/i);
  });

  it("reconhece só códigos do mapa", () => {
    expect(ehCodigoConhecido("auth.link_expirou")).toBe(true);
    expect(ehCodigoConhecido("hasOwnProperty")).toBe(false);
    expect(ehCodigoConhecido(42)).toBe(false);
  });

  it("todo código segue o formato area.nome", () => {
    for (const codigo of Object.keys(MENSAGENS)) {
      expect(codigo).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
  });
});

describe("códigos das telas comuns (História 1.3)", () => {
  it("tem os textos do EXPERIENCE.md", () => {
    expect(mensagem("app.tela_pequena")).toBe(
      "O Conta Comigo foi feito para iPad e computador.",
    );
    expect(mensagem("carregar.falhou")).toBe("Não foi possível carregar.");
    expect(mensagem("salvar.falhou")).toBe(
      "Não foi possível salvar. Tente de novo.",
    );
    expect(mensagem("conexao.sem_conexao")).toBe(
      "Sem conexão. Você pode consultar, mas não alterar.",
    );
    expect(mensagem("conexao.gravar_sem_conexao")).toBe(
      "Sem conexão. Tente de novo quando a internet voltar.",
    );
    expect(ehCodigoConhecido("acao.desfeita")).toBe(true);
  });

  it("as perguntas têm sempre as mesmas duas respostas", () => {
    expect(Object.values(RESPOSTAS_PERGUNTA)).toEqual([
      "Só este",
      "Aplicar a todos",
    ]);
  });

  it("os rótulos comuns dizem o que fazem", () => {
    expect(ROTULOS.tentar_de_novo).toBe("Tentar de novo");
    expect(ROTULOS.desfazer).toBe("Desfazer");
  });
});
