import { describe, expect, it } from "vitest";
import {
  textoSugestao,
  TEXTOS_REVISAR,
  rotuloAjusteDoItem,
  rotuloClassificados,
  rotuloFaixaImportacao,
  rotuloFaltam,
  rotuloMesDoItem,
  rotuloResumoClassificacao,
  tituloGrupoRevisar,
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
  avisoReimportar,
  rotuloReimportado,
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
  rotuloItemMes,
  rotuloLancamentos,
  rotuloParcelaFalada,
  sobrelinhaFatura,
  TEXTOS_CONFERENCIA,
  frasesFaixaConferencia,
  rotuloBotaoDiferenca,
  rotuloSeloConferencia,
  COLUNAS_FILTRO,
  TEXTOS_FILTROS,
  rotuloMaisFiltros,
  rotuloPilulaFiltro,
  rotuloValorFiltro,
  tituloPopoverFiltro,
  TEXTOS_LANCAMENTO,
  descricaoExcluirLancamento,
  TEXTOS_AJUSTE,
  rotuloAjusteDaMae,
  rotuloAjusteDe,
  rotuloLiquido,
  rotuloSegueAParcela,
  rotuloAlteradoEmOutroAparelho,
  rotuloConferenciaDiferenca,
  rotuloDetalhesLancamento,
  rotuloIncluidoEm,
  rotuloSalvoAs,
  rotuloSelecionar,
} from "./mensagens";
import type { Conferencia } from "./conferencia";

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
      "Ações",
    ]);
    expect(ROTULOS_LANCADO_POR).toEqual({ fatura: "Fatura", sistema: "Sistema", manual: "Manual", historico: "Histórico" });
    expect(TEXTOS_PAINEL.total).toBe("Total dos lançamentos");
  });

  it("filtro e ordenação", () => {
    expect(rotuloFiltrarPor("Rafael")).toBe("Filtrar por Rafael");
    expect(rotuloParcelaFalada(2, 12)).toBe("parcela 2 de 12");
    expect(rotuloParcelaFalada(null, null)).toBe("");
  });
});

describe("Conferência no Painel (História 2.5)", () => {
  const base = (extra: Partial<Conferencia> = {}): Conferencia => ({
    faturaId: "f10",
    quantidade: 49,
    despesasCentavos: 832739,
    creditosCentavos: 63962,
    totalDespesasLidoCentavos: 832739,
    totalCreditosLidoCentavos: 63962,
    diferencaDespesasCentavos: 0,
    diferencaCreditosCentavos: 0,
    porCartao: [],
    conferido: true,
    incompleta: false,
    cartoesComDiferenca: [],
    ...extra,
  });
  const cartao = (final: string, diferencaCentavos: number) => ({
    final,
    lidoCentavos: 0,
    despesasCentavos: 0,
    diferencaCentavos,
  });

  it("selo: Conferido ou a diferença das despesas, senão dos créditos, senão a maior de cartão", () => {
    expect(rotuloSeloConferencia(base())).toBe("✓ Conferido");
    expect(
      rotuloSeloConferencia(
        base({
          conferido: false,
          diferencaDespesasCentavos: -72000,
          diferencaCreditosCentavos: 5,
          porCartao: [cartao("8673", -72000)],
        }),
      ),
    ).toBe(`⚠ Diferença de R$${ESPACO}720,00`);
    expect(rotuloBotaoDiferenca(base({ conferido: false, diferencaDespesasCentavos: -72000 }))).toBe(
      `Diferença de R$${ESPACO}720,00, ver lançamentos para verificar`,
    );
    expect(rotuloSeloConferencia(base({ conferido: false, diferencaCreditosCentavos: 2500 }))).toBe(
      `⚠ Diferença de R$${ESPACO}25,00`,
    );
    expect(
      rotuloSeloConferencia(base({ conferido: false, porCartao: [cartao("8673", -80000), cartao("9277", 80001)] })),
    ).toBe(`⚠ Diferença de R$${ESPACO}800,01`);
  });

  it("faixa: despesas, créditos e cartões, com abaixo/acima", () => {
    expect(frasesFaixaConferencia(base())).toEqual([]);
    expect(
      frasesFaixaConferencia(base({ conferido: false, diferencaDespesasCentavos: -72000, cartoesComDiferenca: ["8673"] })),
    ).toEqual([
      `A soma dos lançamentos ficou R$${ESPACO}720,00 abaixo do total da fatura.`,
      "A diferença está no cartão final 8673.",
    ]);
    expect(frasesFaixaConferencia(base({ conferido: false, diferencaCreditosCentavos: 800 }))).toEqual([
      `A soma dos créditos ficou R$${ESPACO}8,00 acima do total de créditos da fatura.`,
    ]);
    expect(frasesFaixaConferencia(base({ conferido: false, cartoesComDiferenca: ["8673", "9277"] }))).toEqual([
      "A diferença está nos cartões finais 8673 e 9277.",
    ]);
    expect(frasesFaixaConferencia(base({ conferido: false, cartoesComDiferenca: ["3967", "8673", "9277"] }))).toEqual([
      "A diferença está nos cartões finais 3967, 8673 e 9277.",
    ]);
  });

  it("textos fixos da pílula, da bolinha, do vazio e do toast", () => {
    expect(TEXTOS_CONFERENCIA.verificar).toBe("Verificar");
    expect(TEXTOS_CONFERENCIA.verificar_lancamento).toBe("verificar este lançamento");
    expect(TEXTOS_CONFERENCIA.sem_para_verificar).toBe("Nenhum lançamento para verificar");
    expect(TEXTOS_CONFERENCIA.alerta_dispensado).toBe("Alerta dispensado");
    expect(TEXTOS_CONFERENCIA.ver_lancamentos).toBe("Ver lançamentos");
    expect(TEXTOS_CONFERENCIA.dispensar).toBe("Dispensar");
  });
});

describe("Barra de filtros (História 2.6)", () => {
  it("pílula, título do popover, Mais e caixa", () => {
    expect(rotuloPilulaFiltro(COLUNAS_FILTRO.responsavel, [])).toBe("Responsável");
    expect(rotuloPilulaFiltro(COLUNAS_FILTRO.responsavel, ["Casal", "Rangel"])).toBe("Responsável: Casal, Rangel");
    expect(rotuloPilulaFiltro(COLUNAS_FILTRO.cartao, ["3967"])).toBe("Cartão: 3967");
    expect(tituloPopoverFiltro(COLUNAS_FILTRO.responsavel)).toBe("Responsável (pode marcar vários)");
    expect(rotuloMaisFiltros(0)).toBe("Mais");
    expect(rotuloMaisFiltros(1)).toBe("Mais (1)");
    expect(rotuloValorFiltro("Casal", 3)).toBe("Casal, 3 lançamentos");
    expect(rotuloValorFiltro("Sem responsável", 1)).toBe("Sem responsável, 1 lançamento");
  });

  it("textos fixos", () => {
    expect(TEXTOS_FILTROS.buscar).toBe("Buscar nome ou apelido");
    expect(TEXTOS_FILTROS.limpar_filtros).toBe("Limpar filtros");
    expect(TEXTOS_FILTROS.sem_resultado).toBe("Nenhum lançamento com esses filtros");
    expect(Object.values(COLUNAS_FILTRO)).toEqual(["Responsável", "Tipo", "Status", "Lançado por", "Parcela", "Cartão"]);
  });
});

describe("painel do Lançamento (História 2.7)", () => {
  it("códigos lancamento.* com mensagem no tom do EXPERIENCE.md", () => {
    expect(mensagem("lancamento.nome_vazio")).toBe("Preencha o nome.");
    expect(mensagem("lancamento.valor_vazio")).toBe("Preencha o valor.");
    // Zero vale (História 2.8): o código saiu do mapa.
    expect(ehCodigoConhecido("lancamento.valor_zero")).toBe(false);
    expect(mensagem("lancamento.apelido_longo")).toBe("Use até 60 caracteres.");
    expect(mensagem("lancamento.observacao_longa")).toBe("Use até 500 caracteres.");
    expect(mensagem("lancamento.sem_cartao")).toBe("Escolha o cartão");
  });

  it("indicador, Conferência, faixa, toast e linha só de leitura", () => {
    expect(TEXTOS_LANCAMENTO.salvando).toBe("Salvando…");
    expect(rotuloSalvoAs("21:14")).toBe("Salvo às 21:14");
    expect(TEXTOS_LANCAMENTO.tentando).toBe("Não salvo, tentando de novo");
    expect(TEXTOS_LANCAMENTO.conferencia_ok).toBe("Conferência: ✓");
    expect(rotuloConferenciaDiferenca(72000)).toBe(`Conferência: diferença de R$${ESPACO}720,00`);
    expect(rotuloAlteradoEmOutroAparelho("21:30")).toBe("Este lançamento foi alterado em outro aparelho às 21:30");
    expect(TEXTOS_LANCAMENTO.excluido_em_outro_aparelho).toBe("Este lançamento foi excluído em outro aparelho");
    expect(rotuloIncluidoEm("2026-12")).toBe("Lançamento incluído em dezembro/26");
    expect(rotuloDetalhesLancamento("05/10", "8673", "Fatura")).toBe("Parcela 05/10 · cartão final 8673 · Lançado por Fatura");
    expect(rotuloDetalhesLancamento("", null, "Manual")).toBe("Lançado por Manual");
    expect(rotuloSelecionar("MSC CRUZEIROS")).toBe("Selecionar MSC CRUZEIROS");
    expect(TEXTOS_LANCAMENTO.selecionar_todos).toBe("Selecionar todos");
    expect(TEXTOS_LANCAMENTO.confirmar_excluir).toBe("Excluir lançamento");
    expect(descricaoExcluirLancamento("PADARIA", true)).toBe(
      "“PADARIA” sai da grade e da Conferência. Dá para desfazer logo depois.",
    );
    expect(descricaoExcluirLancamento("PADARIA", false)).toBe("“PADARIA” sai da grade. Dá para desfazer logo depois.");
  });
});

describe("Ajustes de centavos (História 2.8)", () => {
  const sem = (t: string) => t.replaceAll(ESPACO, " ");

  it("grade, VoiceOver e painel", () => {
    expect(TEXTOS_AJUSTE).toEqual({ marca: "↳", desvincular: "Desvincular", desvinculado: "Desvinculado" });
    expect(rotuloAjusteDe("MSC CRUZEIROS")).toBe("Ajuste de MSC CRUZEIROS");
    expect(sem(rotuloLiquido(114066))).toBe("líquido R$ 1.140,66");
    expect(rotuloSegueAParcela("MSC CRUZEIROS")).toBe("Segue a parcela MSC CRUZEIROS");
    expect(sem(rotuloAjusteDaMae(-8, 114066))).toBe("Ajuste - R$ 0,08 · líquido R$ 1.140,66");
  });

  it("excluir a mãe diz que os Ajustes saem juntos", () => {
    expect(descricaoExcluirLancamento("MSC CRUZEIROS", true, 1)).toBe(
      "“MSC CRUZEIROS” sai da grade e da Conferência junto com o Ajuste dele. Dá para desfazer logo depois.",
    );
    expect(descricaoExcluirLancamento("MSC CRUZEIROS", true, 2)).toBe(
      "“MSC CRUZEIROS” sai da grade e da Conferência junto com os 2 Ajustes dele. Dá para desfazer logo depois.",
    );
  });
});

describe("sugestão da fila no painel (História 3.1)", () => {
  it("Responsável · Tipo, com dúvida, só um deles, ou nada", () => {
    expect(textoSugestao("Casal", "Casa")).toBe("Sugestão: Casal · Casa");
    expect(textoSugestao("Casal", "Saúde", ["Rafael"])).toBe("Sugestão: Casal · Saúde (às vezes Rafael)");
    expect(textoSugestao("Casal", null, ["Rafael", "Mãe"])).toBe("Sugestão: Casal (às vezes Rafael ou Mãe)");
    expect(textoSugestao(null, "Gatos")).toBe("Sugestão: Gatos");
    expect(textoSugestao(null, null, ["Rafael"])).toBeNull();
  });
});

describe("reimportar um Mês (História 3.11)", () => {
  it("aviso com N, X e os excluídos que voltam", () => {
    expect(avisoReimportar("2026-11", { quantidade: 52, mexidos: 30, excluidos: 2 })).toBe(
      "Esta fatura já foi importada. Importar de novo apaga os 52 lançamentos de novembro vindos da fatura (30 já classificados ou marcados à mão) e importa tudo de novo. Os 2 excluídos voltam.",
    );
  });

  it("singulares; sem excluídos, a última frase some", () => {
    expect(avisoReimportar("2026-10", { quantidade: 1, mexidos: 1, excluidos: 1 })).toBe(
      "Esta fatura já foi importada. Importar de novo apaga o 1 lançamento de outubro vindo da fatura (1 já classificado ou marcado à mão) e importa tudo de novo. O 1 excluído volta.",
    );
    expect(avisoReimportar("2026-10", { quantidade: 49, mexidos: 0, excluidos: 0 })).toBe(
      "Esta fatura já foi importada. Importar de novo apaga os 49 lançamentos de outubro vindos da fatura (0 já classificados ou marcados à mão) e importa tudo de novo.",
    );
  });

  it("botão e toast", () => {
    expect(TEXTOS_IMPORTAR.importar_de_novo).toBe("Importar de novo");
    expect(rotuloReimportado("2026-11", 52)).toBe("Fatura de novembro importada de novo · 52 lançamentos");
    expect(rotuloReimportado("2026-11", 1)).toBe("Fatura de novembro importada de novo · 1 lançamento");
  });
});

describe("textos da fila do Revisar (História 3.2)", () => {
  it("fila vazia, Faltam, grupo e Mês", () => {
    expect(TEXTOS_REVISAR.tudo_revisado).toBe("Tudo revisado. Nada novo neste mês");
    expect(rotuloFaltam(17)).toBe("Faltam 17");
    expect(rotuloFaltam(1)).toBe("Falta 1");
    expect(tituloGrupoRevisar("SHOPEE", 3)).toBe("SHOPEE · 3 lançamentos");
    expect(rotuloMesDoItem("2026-10")).toBe("Out/26");
  });

  it("Ajuste sob a mãe, com o formatador de dinheiro do núcleo", () => {
    expect(rotuloAjusteDoItem(-8)).toBe(`Ajuste -${ESPACO}R$${ESPACO}0,08`);
  });

  it("resumo da importação: faixa do topo e passo final", () => {
    expect(rotuloClassificados(1)).toBe("1 classificado");
    expect(rotuloResumoClassificacao(30, 17)).toBe("30 classificados · 17 para revisar");
    expect(rotuloFaixaImportacao("2026-11", "✓ Conferido", { lancamentos: 47, classificados: 30, paraRevisar: 17 })).toBe(
      "Importação de novembro · ✓ Conferido · 47 lançamentos · 30 classificados · 17 para revisar",
    );
  });
});
