import { describe, expect, it } from "vitest";
import {
  MENSAGENS,
  RESPOSTAS_PERGUNTA,
  ROTULOS,
  ehCodigoConhecido,
  mensagem,
  rotuloAcoesDe,
  rotuloCicloAtual,
  rotuloContaComoPagoDe,
  rotuloCor,
  rotuloCorDe,
  rotuloPasso,
  rotuloProximoCiclo,
  rotuloProximosPassos,
  TEXTOS_PASSO,
  rotuloRegistros,
  tituloEmUso,
  tituloExcluir,
} from "./mensagens";
import { PASSOS_PRIMEIRO_USO } from "./primeiro-uso";
import { ESPACO } from "./dinheiro";
import type { ConferenciaImportacao } from "./importacao-fatura";
import {
  ETAPAS_IMPORTACAO,
  TEXTOS_IMPORTAR,
  rotuloComposicaoTotal,
  rotuloConferencia,
  rotuloConferenciaTotal,
  rotuloDespesasCreditos,
  rotuloTotalAPagar,
  rotuloPassoImportar,
  rotuloSeraoGravados,
  textoExtracaoIncompleta,
  tituloFaturaLida,
  COLUNAS_GRADE,
  ROTULOS_LANCADO_POR,
  TEXTOS_PAINEL,
  rotuloEscolherMes,
  rotuloFiltrarPor,
  rotuloFiltroResponsavel,
  rotuloItemMes,
  rotuloLancamentos,
  rotuloParcelaFalada,
  rotuloSemLancamentosDe,
  sobrelinhaFatura,
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
    expect(ROTULOS.voltar).toBe("Voltar");
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

describe("Ciclo, Conferência e atraso e Aparência (História 1.7)", () => {
  it("tem as mensagens dos campos e do banco", () => {
    expect(mensagem("ciclo.dia_invalido")).toBe("Use um dia de 1 a 31.");
    expect(mensagem("ajuste.limite_fora")).toBe("Use um valor de R$ 0,01 a R$ 10,00.");
    expect(mensagem("atraso.tolerancia_invalida")).toBe("Use de 0 a 60 dias.");
    for (const codigo of [
      "ciclo.data_invalida",
      "ciclo.mes_invalido",
      "ciclo.sem_configuracao",
      "ciclo.vigente_no_passado",
      "dinheiro.invalido",
      "ajuste.limite_invalido",
    ]) {
      expect(ehCodigoConhecido(codigo)).toBe(true);
    }
  });

  it("os rótulos das seções e a nota do Ciclo", () => {
    expect(ROTULOS.ciclo).toBe("Ciclo do cartão");
    expect(ROTULOS.conferencia).toBe("Conferência e atraso");
    expect(ROTULOS.aparencia).toBe("Aparência");
    expect(ROTULOS.nota_ciclo).toBe("O fechamento só define em que mês entram as contas lançadas à mão");
    expect(ROTULOS.dia_fechamento).toBe("Dia de fechamento");
    expect(ROTULOS.dia_vencimento).toBe("Dia de vencimento");
    expect(ROTULOS.salvar).toBe("Salvar");
    expect([ROTULOS.aparencia_sistema, ROTULOS.aparencia_claro, ROTULOS.aparencia_escuro]).toEqual([
      "Sistema",
      "Claro",
      "Escuro",
    ]);
    expect(rotuloProximoCiclo("Jan/27", 5, 15)).toBe("A partir de Jan/27: fechamento dia 5, vencimento dia 15");
    expect(rotuloCicloAtual("Dez/26", 28, 6)).toBe("Vale hoje (Dez/26): fechamento dia 28, vencimento dia 6");
  });
});

describe("textos do Primeiro uso (História 1.8)", () => {
  it("o Painel vazio chama para importar a primeira fatura", () => {
    expect(mensagem("painel.vazio")).toBe("Importe sua primeira fatura");
  });

  it("todo passo tem seção, pergunta e ajuda, com o nome da seção de Configurações", () => {
    expect(Object.keys(TEXTOS_PASSO).sort()).toEqual([...PASSOS_PRIMEIRO_USO].sort());
    expect(PASSOS_PRIMEIRO_USO.map((p) => TEXTOS_PASSO[p].secao)).toEqual([
      ROTULOS.responsaveis,
      ROTULOS.tipos,
      ROTULOS.status,
      ROTULOS.ciclo,
    ]);
    for (const passo of PASSOS_PRIMEIRO_USO) {
      expect(TEXTOS_PASSO[passo].pergunta).toMatch(/\?$/);
      expect(TEXTOS_PASSO[passo].ajuda.length).toBeGreaterThan(0);
    }
    expect(TEXTOS_PASSO.responsaveis.pergunta).toBe("Quem divide o cartão com você?");
  });

  it("cabeçalho do passo, próximos passos e botões", () => {
    expect(rotuloPasso(1, 4, "Responsáveis")).toBe("Passo 1 de 4 · Responsáveis");
    expect(rotuloProximosPassos(["Tipos", "Status", "Ciclo do cartão"])).toBe(
      "Próximos passos: Tipos → Status → Ciclo do cartão",
    );
    expect([ROTULOS.pular, ROTULOS.continuar, ROTULOS.concluir]).toEqual(["Pular", "Continuar", "Concluir"]);
    expect(ROTULOS.retomar_primeiro_uso).toBe("Retomar o Primeiro uso");
    expect(mensagem("rascunho.nao_salvo")).toBe("Você digitou algo que não foi salvo.");
    expect([ROTULOS.voltar_para_salvar, ROTULOS.descartar]).toEqual(["Voltar para salvar", "Descartar"]);
  });
});

describe("textos da importação da fatura (História 2.3)", () => {
  const conferencia = (extra: Partial<ConferenciaImportacao> = {}): ConferenciaImportacao => ({
    quantidade: 49,
    despesasCentavos: 832739,
    creditosCentavos: 63962,
    totalDespesasLidoCentavos: 832739,
    totalCreditosLidoCentavos: 63962,
    diferencaDespesasCentavos: 0,
    diferencaCreditosCentavos: 0,
    porCartao: [{ final: "8673", lidoCentavos: 100, despesasCentavos: 100, diferencaCentavos: 0 }],
    conferido: true,
    incompleta: false,
    ...extra,
  });

  it("título do passo 3 e a contagem de lançamentos", () => {
    expect(tituloFaturaLida("2026-10", "2026-10-06")).toBe("Fatura de outubro · vence 06/10/26");
    expect(rotuloLancamentos(49)).toBe("49 lançamentos");
    expect(rotuloLancamentos(1)).toBe("1 lançamento");
    expect(rotuloDespesasCreditos(832739, 63962)).toBe(`Despesas R$${ESPACO}8.327,39 · Créditos R$${ESPACO}639,62`);
  });

  it("passos, quantos serão gravados e as etapas do progresso", () => {
    expect(rotuloPassoImportar(3)).toBe("Passo 3 de 3 · Conferir");
    expect(rotuloPassoImportar(1)).toBe("Passo 1 de 3 · Escolher o PDF");
    expect(rotuloSeraoGravados(49)).toBe("49 lançamentos serão gravados");
    expect(rotuloSeraoGravados(1)).toBe("1 lançamento será gravado");
    expect(Object.values(ETAPAS_IMPORTACAO)).toEqual(["Abrindo PDF", "Lendo lançamentos", "Conferindo", "Classificando"]);
  });

  it("selo da Conferência: conferido, diferença no cartão ou no total", () => {
    expect(rotuloConferencia(conferencia())).toBe("✓ Conferido");
    expect(
      rotuloConferencia(
        conferencia({
          conferido: false,
          porCartao: [{ final: "8673", lidoCentavos: 100, despesasCentavos: 92, diferencaCentavos: -8 }],
        }),
      ),
    ).toBe(`⚠ Diferença de R$${ESPACO}0,08 no cartão final 8673`);
    expect(rotuloConferencia(conferencia({ conferido: false, diferencaCreditosCentavos: 2590 }))).toBe(
      `⚠ Diferença de R$${ESPACO}25,90`,
    );
  });

  it("estados da janela com os textos do EXPERIENCE.md", () => {
    expect(textoExtracaoIncompleta(41)).toBe(
      "Não conseguimos ler todos os lançamentos (lemos 41). Você pode importar mesmo assim e corrigir à mão, ou cancelar",
    );
    expect(mensagem("fatura.nao_santander")).toBe("Este PDF não parece ser uma fatura do Santander. Confira o arquivo");
    expect(mensagem("fatura.conexao_caiu")).toBe("A conexão caiu. Nada foi gravado. Tente de novo.");
    expect(ehCodigoConhecido("fatura.mes_ja_importado")).toBe(true);
    expect(ehCodigoConhecido("fatura.mes_mudou")).toBe(true);
    expect(TEXTOS_IMPORTAR.escolher_outro_pdf).toBe("Escolher outro PDF");
    expect(TEXTOS_IMPORTAR.importar_mesmo_assim).toBe("Importar mesmo assim");
  });
});

describe("total a pagar da fatura (História 2.3)", () => {
  const composicao = {
    lancamentosCentavos: 768777,
    saldoAnteriorCentavos: 748311,
    pagamentosCentavos: 745721,
    calculadoCentavos: 771367,
    lidoCentavos: 771367,
    diferencaCentavos: 0,
  };
  const r = (texto: string) => texto.replaceAll(ESPACO, " ");

  it("total a pagar lido ou não lido", () => {
    expect(r(rotuloTotalAPagar(771367))).toBe("Total a pagar R$ 7.713,67");
    expect(rotuloTotalAPagar(null)).toBe("Total a pagar não lido");
  });

  it("composição do total: lançamentos + saldo anterior − pagamentos", () => {
    expect(r(rotuloComposicaoTotal(composicao))).toBe(
      "Lançamentos R$ 7.687,77 + saldo anterior R$ 7.483,11 − pagamentos R$ 7.457,21 = R$ 7.713,67",
    );
  });

  it("bate, diferença ou sem o lido", () => {
    expect(rotuloConferenciaTotal(composicao)).toBe("✓ Bate com o total a pagar");
    expect(r(rotuloConferenciaTotal({ ...composicao, diferencaCentavos: -8 }) ?? "")).toBe(
      "⚠ Diferença de R$ 0,08 para o total a pagar",
    );
    expect(rotuloConferenciaTotal({ ...composicao, lidoCentavos: null, diferencaCentavos: null })).toBeNull();
  });
});

describe("textos do Painel do Mês", () => {
  it("sobrelinha do invoice-hero, com e sem Fatura", () => {
    expect(sobrelinhaFatura("2026-10", "2026-10-06")).toBe("Fatura de outubro · vence 06/10/26");
    expect(sobrelinhaFatura("2026-12", null)).toBe("Fatura de dezembro");
  });

  it("seletor de Mês: nome acessível e itens da lista", () => {
    expect(rotuloEscolherMes("2026-10")).toBe("outubro/26, escolher o Mês");
    expect(rotuloItemMes("2026-10", true)).toBe("outubro/26, Fechado");
    expect(rotuloItemMes("2026-12", false)).toBe("dezembro/26");
    expect(TEXTOS_PAINEL.fechado).toBe("Fechado");
    expect(TEXTOS_PAINEL.sem_fatura).toBe("Fatura ainda não importada");
    expect(TEXTOS_PAINEL.sem_responsavel).toBe("Sem responsável");
  });

  it("colunas da grade na ordem da UX-DR10 e rótulos de Lançado por", () => {
    expect(Object.values(COLUNAS_GRADE)).toEqual([
      "Seleção",
      "Nome",
      "Parcela",
      "Valor",
      "Tipo",
      "Responsável",
      "Lançado por",
      "Status",
    ]);
    expect(ROTULOS_LANCADO_POR).toEqual({ fatura: "Fatura", sistema: "Sistema", manual: "Manual", historico: "Histórico" });
    expect(TEXTOS_PAINEL.total).toBe("Total dos lançamentos");
  });

  it("filtro e ordenação", () => {
    expect(rotuloFiltrarPor("Rafael")).toBe("Filtrar por Rafael");
    expect(rotuloFiltroResponsavel("Casal")).toBe("Responsável: Casal");
    expect(rotuloSemLancamentosDe("Rafael")).toBe("Nenhum lançamento de Rafael neste Mês");
    expect(rotuloSemLancamentosDe(null)).toBe("Nenhum lançamento sem responsável neste Mês");
    expect(rotuloParcelaFalada(2, 12)).toBe("parcela 2 de 12");
    expect(rotuloParcelaFalada(null, null)).toBe("");
  });
});
