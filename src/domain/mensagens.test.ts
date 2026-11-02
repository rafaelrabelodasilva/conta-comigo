import { describe, expect, it } from "vitest";
import {
  MENSAGENS,
  RESPOSTAS_PERGUNTA,
  ROTULOS,
  ehCodigoConhecido,
  mensagem,
  rotuloAcoesDe,
  rotuloContaComoPagoDe,
  rotuloCor,
  rotuloCorDe,
  rotuloRegistros,
  tituloEmUso,
  tituloExcluir,
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

describe("códigos de Responsável (História 1.4)", () => {
  it("tem as mensagens do cadastro", () => {
    expect(mensagem("responsavel.nome_vazio")).toBe("Preencha o nome.");
    expect(mensagem("responsavel.nome_repetido")).toBe(
      "Já existe um Responsável com esse nome.",
    );
    expect(mensagem("responsavel.sem_cor_livre")).toBe("Todas as 8 cores estão em uso.");
    expect(ehCodigoConhecido("responsavel.nome_longo")).toBe(true);
    expect(ehCodigoConhecido("responsavel.nao_move")).toBe(true);
  });

  it("os rótulos do ⋯ dizem o que fazem", () => {
    expect(ROTULOS.mover_para_cima).toBe("Mover para cima");
    expect(ROTULOS.mover_para_baixo).toBe("Mover para baixo");
    expect(ROTULOS.desarquivar).toBe("Desarquivar");
    expect(ROTULOS.arquivado).toBe("Arquivado");
  });
});

describe("textos da seção Responsáveis", () => {
  it("vêm do mapa e das funções de rótulo", () => {
    expect(mensagem("responsavel.lista_vazia")).toBe("Cadastre quem divide a fatura com você.");
    expect(ROTULOS.novo).toBe("Novo");
    expect(ROTULOS.responsaveis).toBe("Responsáveis");
    expect(ROTULOS.nome_novo_responsavel).toBe("Nome do novo Responsável");
    expect(rotuloAcoesDe("Rafael")).toBe("Ações de Rafael");
    expect(rotuloCorDe("Rafael")).toBe("Cor de Rafael");
    expect(rotuloCor("Azul", false)).toBe("Azul");
    expect(rotuloCor("Azul", true)).toBe("Azul, em uso");
  });
});

describe("códigos de Tipo (História 1.5)", () => {
  it("tem as mensagens do cadastro", () => {
    expect(mensagem("tipo.nome_vazio")).toBe("Preencha o nome.");
    expect(mensagem("tipo.nome_longo")).toBe("Use até 30 caracteres.");
    expect(mensagem("tipo.nome_repetido")).toBe("Já existe um Tipo com esse nome.");
    expect(mensagem("tipo.nao_arquivado")).toBe("Este Tipo não está arquivado.");
    expect(mensagem("tipo.lista_vazia")).toMatch(/primeiro Tipo/);
  });

  it("os rótulos da seção Tipos", () => {
    expect(ROTULOS.tipos).toBe("Tipos");
    expect(ROTULOS.nome_novo_tipo).toBe("Nome do novo Tipo");
  });
});

describe("códigos de Status e de exclusão (História 1.6)", () => {
  it("tem as mensagens do cadastro de Status", () => {
    expect(mensagem("status.nome_vazio")).toBe("Preencha o nome.");
    expect(mensagem("status.nome_longo")).toBe("Use até 30 caracteres.");
    expect(mensagem("status.nome_repetido")).toBe("Já existe um Status com esse nome.");
    expect(mensagem("status.nao_arquivado")).toBe("Este Status não está arquivado.");
    expect(mensagem("status.padrao_nao_arquiva")).toBe(
      "Escolha outro Status padrão antes de arquivar.",
    );
    expect(ehCodigoConhecido("status.lista_vazia")).toBe(true);
  });

  it("os erros da RPC têm mensagem", () => {
    for (const codigo of [
      "cadastro.em_uso",
      "cadastro.sem_substituto",
      "cadastro.substituto_invalido",
      "cadastro.nao_encontrado",
      "cadastro.invalido",
    ]) {
      expect(ehCodigoConhecido(codigo)).toBe(true);
    }
  });

  it("os rótulos da seção Status e da exclusão", () => {
    expect(ROTULOS.status).toBe("Status");
    expect(ROTULOS.conta_como_pago).toBe("Conta como pago");
    expect(ROTULOS.status_padrao).toBe("Status padrão das linhas novas");
    expect(ROTULOS.nenhum_nao_pago).toBe("Nenhum (não pago)");
    expect(ROTULOS.excluir).toBe("Excluir");
    expect(ROTULOS.substituir_e_excluir).toBe("Substituir e excluir");
    expect(rotuloRegistros(0)).toBe("0 registros");
    expect(rotuloRegistros(1)).toBe("1 registro");
    expect(rotuloRegistros(3)).toBe("3 registros");
    expect(tituloEmUso(3, "Pago")).toBe("3 registros usam “Pago”");
    expect(tituloEmUso(1, "Pago")).toBe("1 registro usa “Pago”");
    expect(tituloExcluir("Casa")).toBe("Excluir “Casa”?");
    expect(rotuloContaComoPagoDe("Pago")).toBe("Pago conta como pago");
  });
});
