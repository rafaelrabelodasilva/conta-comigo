// Mapa único `codigo → mensagem` (AD de erros). Todo texto mostrado ao
// usuário a partir de um código de erro ou aviso sai daqui. A História 1.3
// estende este mapa com os códigos das telas seguintes.
//
// Regras: os códigos são estáveis (podem ir para o log); as mensagens são
// para a pessoa e podem mudar. Erro de login nunca diz qual campo errou.

import type { PassoPrimeiroUso } from "./primeiro-uso";
import { partesDaDiferenca, valorDaDiferenca, type Conferencia, type SentidoDiferenca } from "./conferencia";
import { formatarData, formatarMes, formatarMesExtenso, formatarNomeDoMes } from "./datas";
import { arredondar, formatarDinheiro } from "./dinheiro";
import type { Divisao } from "./divisao";
import { primeiraDiferenca, type ComposicaoTotalAPagar, type ConferenciaImportacao } from "./importacao-fatura";
import type { ResumoDoPlano } from "./reimportacao";

export const MENSAGENS = {
  "auth.campos_vazios": "Preencha o e-mail e a senha.",
  "auth.email_vazio": "Preencha o e-mail.",
  "auth.credenciais_invalidas": "E-mail ou senha incorretos.",
  "auth.muitas_tentativas":
    "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
  "auth.sessao_expirou": "Sua sessão expirou. Entre de novo.",
  "auth.link_expirou":
    "O link expirou ou já foi usado. Peça outro em “Esqueci a senha”.",
  "auth.indisponivel": "Login indisponível neste ambiente.",
  "auth.redefinicao_enviada":
    "Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha. Abra o link neste mesmo navegador.",
  "auth.senha_vazia": "Preencha a nova senha e a confirmação.",
  "auth.senhas_diferentes": "A senha e a confirmação não são iguais.",
  "auth.senha_fraca": "Essa senha é fraca. Use uma senha mais longa.",
  "auth.senha_igual": "A nova senha precisa ser diferente da atual.",
  "auth.erro_inesperado": "Não foi possível concluir agora. Tente de novo.",
  "erro.desconhecido": "Algo deu errado. Tente de novo.",
  "app.tela_pequena": "O Conta Comigo foi feito para iPad e computador.",
  "app.em_breve": "Esta tela ainda está sendo construída.",
  "painel.vazio": "Importe sua primeira fatura",
  "rascunho.nao_salvo": "Você digitou algo que não foi salvo.",
  "modelo.saudacao_longa": "Use até 120 caracteres.",
  "modelo.frase_longa": "Use até 200 caracteres.",
  "modelo.pix_longo": "Use até 300 caracteres.",
  "modelo.rodape_longo": "Use até 500 caracteres.",
  "modelo.marcador_invalido": "Só existe o marcador {total}. Confira as chaves { }.",
  "modelo.chaves_fora_da_frase": "As chaves { } só valem como {total}, na frase do total.",
  "modelo.sem_campos": "Marque ao menos um campo da linha de detalhe.",
  "carregar.falhou": "Não foi possível carregar.",
  "salvar.falhou": "Não foi possível salvar. Tente de novo.",
  "conexao.sem_conexao": "Sem conexão. Você pode consultar, mas não alterar.",
  "conexao.gravar_sem_conexao":
    "Sem conexão. Tente de novo quando a internet voltar.",
  "acao.desfeita": "Ação desfeita.",
  "responsavel.nome_vazio": "Preencha o nome.",
  "responsavel.nome_longo": "Use até 30 caracteres.",
  "responsavel.nome_repetido": "Já existe um Responsável com esse nome.",
  "responsavel.sem_cor_livre": "Todas as 8 cores estão em uso.",
  "responsavel.nao_move": "Não dá para mover nessa direção.",
  "responsavel.nao_arquivado": "Este Responsável não está arquivado.",
  "responsavel.lista_vazia": "Cadastre quem divide a fatura com você.",
  "tipo.nome_vazio": "Preencha o nome.",
  "tipo.nome_longo": "Use até 30 caracteres.",
  "tipo.nome_repetido": "Já existe um Tipo com esse nome.",
  "tipo.nao_arquivado": "Este Tipo não está arquivado.",
  "tipo.lista_vazia": "Crie o primeiro Tipo para classificar seus gastos, como Casa ou Viagem.",
  "status.nome_vazio": "Preencha o nome.",
  "status.nome_longo": "Use até 30 caracteres.",
  "status.nome_repetido": "Já existe um Status com esse nome.",
  "status.nao_arquivado": "Este Status não está arquivado.",
  "status.lista_vazia": "Crie os Status das suas contas, como Não pago e Pago.",
  "status.padrao_nao_arquiva": "Escolha outro Status padrão antes de arquivar.",
  "regra.vazia": "Deixe ao menos o Responsável ou o Tipo.",
  "cadastro.em_uso": "Está em uso. Escolha um substituto ou arquive.",
  "cadastro.sem_substituto": "Escolha um substituto.",
  "cadastro.substituto_invalido": "Escolha um substituto ativo.",
  "cadastro.nao_encontrado": "Este cadastro não existe mais.",
  "cadastro.invalido": "Não foi possível excluir. Tente de novo.",
  "cadastro.excluir_irreversivel": "Esta ação não pode ser desfeita.",
  "ciclo.dia_invalido": "Use um dia de 1 a 31.",
  "ciclo.data_invalida": "Data inválida.",
  "ciclo.mes_invalido": "Mês inválido.",
  "ciclo.sem_configuracao": "Informe o dia de fechamento e o de vencimento do cartão.",
  "ciclo.vigente_no_passado": "A mudança do Ciclo não pode valer para um mês que já passou.",
  "dinheiro.invalido": "Valor inválido. Use, por exemplo, 1,50.",
  // História 5.1: cadastrar uma Conta manual.
  "conta.nome_vazio": "Digite o nome da conta.",
  "conta.nome_longo": "O nome da conta pode ter até 100 caracteres.",
  "conta.valor_invalido": "Digite um valor, como 318,00.",
  "conta.valor_zero": "O valor precisa ser maior que R$ 0,00.",
  "conta.valor_grande": "O valor é grande demais (até R$ 900.000,00).",
  "conta.parcelas_invalidas": "Digite de 2 a 120 parcelas.",
  "conta.mes_invalido": "Escolha o mês em que a conta começa.",
  "conta.mes_fora_do_limite": "Escolha um mês entre cinco anos atrás e cinco anos à frente.",
  "conta.sem_tipo": "Escolha o Tipo.",
  "conta.tipo_arquivado": "Esse Tipo foi arquivado. Escolha outro.",
  "conta.sem_responsavel": "Escolha o Responsável.",
  "conta.responsavel_arquivado": "Esse Responsável foi arquivado. Escolha outro.",
  "conta.observacao_longa": "A observação pode ter até 200 caracteres.",
  "conta.serie_ocupada": "Outra conta igual foi salva agora. Tente de novo.",
  "conta.nao_encontrada": "Esta conta não existe mais. Nada foi gravado.",
  "divisao.fracoes_invalidas": "As frações da divisão precisam somar 100%.",
  "divisao.fracao_invalida": "Use uma fração como 2/3 ou uma porcentagem como 33,33%.",
  "divisao.valor_zero": "Um lançamento de R$ 0,00 não pode ser dividido.",
  "divisao.valor_grande": "O valor é grande demais para dividir (até R$ 900.000,00).",
  "divisao.poucas_partes": "Divida em pelo menos 2 partes.",
  "divisao.partes_demais": "Divida em até 10 partes.",
  "divisao.sem_responsavel": "Escolha o Responsável de cada parte.",
  "divisao.parte_zerada": "Uma parte ficou com R$ 0,00. Mude os valores ou as frações.",
  "divisao.soma_diferente": "A soma das partes precisa ser igual ao valor do lançamento.",
  "divisao.sem_tipo": "Escolha o Tipo antes de dividir.",
  "divisao.com_ajuste": "Este lançamento tem um Ajuste de centavos. Desvincule o Ajuste antes de dividir.",
  "divisao.mae_invalida": "Este lançamento não pode ser dividido.",
  "divisao.filha_invalida": "A divisão mudou em outro aparelho. Abra de novo e tente outra vez.",
  "ajuste.limite_invalido": "Valor inválido. Use, por exemplo, 1,50.",
  "ajuste.limite_fora": "Use um valor de R$ 0,01 a R$ 10,00.",
  "atraso.tolerancia_invalida": "Use de 0 a 60 dias.",
  "fatura.sem_arquivo": "Escolha o PDF da fatura.",
  "fatura.senha_vazia": "Digite a senha do PDF.",
  "fatura.senha_incorreta": "Senha incorreta",
  "fatura.pdf_invalido": "Não foi possível abrir este PDF.",
  "fatura.sem_texto": "Este PDF não tem texto para ler. Confira o arquivo.",
  "fatura.requisicao_invalida": "Não foi possível enviar o texto da fatura. Tente de novo.",
  "fatura.leitura_indisponivel": "A leitura de faturas está indisponível agora.",
  "fatura.leitura_falhou": "Não conseguimos ler os lançamentos da fatura. Tente de novo.",
  "fatura.tempo_esgotado": "A leitura demorou demais. Tente de novo.",
  "fatura.leitura_ocupada": "A leitura está sobrecarregada agora. Tente de novo em alguns minutos.",
  "fatura.conexao_caiu": "A conexão caiu. Nada foi gravado. Tente de novo.",
  "fatura.nao_santander": "Este PDF não parece ser uma fatura do Santander. Confira o arquivo",
  "fatura.mes_ja_importado": "A fatura deste Mês já foi importada. Nada foi gravado.",
  "fatura.mes_mudou":
    "Os lançamentos deste Mês mudaram em outro aparelho. Nada foi gravado. Tente de novo.",
  // História 3.6: o casamento junta os previstos à fatura; este erro só sobra se os previstos do Mês mudaram durante a importação.
  "fatura.previstos_sem_casamento":
    "As parcelas previstas deste Mês mudaram durante a importação. Nada foi gravado. Importe a fatura de novo.",
  // História 3.10: importar o histórico da planilha.
  "planilha.mes_com_fatura": "Este Mês já tem fatura importada. As linhas da planilha não foram gravadas.",
  "planilha.serie_ocupada": "Uma parcela deste Mês já existe na mesma compra parcelada. Nada foi gravado.",
  "planilha.cabecalho": "A primeira linha não tem as colunas esperadas (Despesa, Valor, Parcela, Tipo e Responsabilidade).",
  "planilha.despesa_vazia": "Há uma linha com valor e sem Despesa.",
  "planilha.valor_ausente": "Há uma linha com Despesa e sem Valor.",
  "planilha.valor_invalido": "Há um Valor que não consegui ler.",
  "planilha.parcela_invalida": "Há uma Parcela que não consegui ler (esperado 03/10).",
  "planilha.linha_invalida": "Há uma linha com dados inválidos.",
  "planilha.arquivo_invalido": "Não consegui abrir este arquivo. Escolha o .xlsx baixado do Google Sheets.",
  "planilha.sem_abas": "Não encontrei abas de Mês (como 03/2026) neste arquivo.",
  "lancamento.nome_vazio": "Preencha o nome.",
  "lancamento.nome_longo": "Use até 200 caracteres.",
  "lancamento.valor_vazio": "Preencha o valor.",
  "lancamento.valor_invalido": "Valor inválido. Use, por exemplo, 1,50.",
  "lancamento.data_invalida": "Data inválida.",
  "lancamento.data_da_fatura": "Um lançamento da fatura precisa de data.",
  "lancamento.apelido_longo": "Use até 60 caracteres.",
  "lancamento.observacao_longa": "Use até 500 caracteres.",
  "lancamento.sem_cartao": "Escolha o cartão",
  // História 4.1: a Fórmula do Bloco. As razões que deixam "Salvar" desativado.
  "formula.vazia": "Monte a fórmula tocando nas fichas",
  "formula.invalida": "Não foi possível ler esta fórmula.",
  "formula.grande": "A fórmula ficou grande demais",
  "formula.comeca_com_operacao": "A fórmula começa com uma operação",
  "formula.grupo_comeca_com_operacao": "Um parêntese não pode começar com uma operação",
  "formula.operacoes_seguidas": "Há duas operações seguidas",
  "formula.operacao_sem_valor": "Falta um valor depois da operação",
  "formula.grupo_vazio": "Há um parêntese vazio",
  "formula.fecha_sobrando": "Há um parêntese fechado sem abrir",
  "formula.falta_operacao": "Falta uma operação entre dois valores",
  "formula.termina_com_operacao": "A fórmula termina com uma operação",
  "formula.parentese_aberto": "Falta fechar um parêntese",
  "formula.divisao_por_zero": "Divisão por zero",
  "formula.dinheiro_com_dinheiro": "× e ÷ pedem um número de um dos lados, não dois valores em R$",
  "formula.valor_grande": "O valor da fórmula ficou grande demais",
  "bloco.nome_vazio": "Dê um nome ao Bloco",
  "bloco.nome_longo": "Use até 30 caracteres.",
  "bloco.nome_repetido": "Já existe um Bloco com esse nome.",
  "bloco.ordem_invalida": "Os Blocos mudaram em outro aparelho. Tente de novo.",
} as const;

/** Textos da janela "Importar fatura" (UX-DR20, mockup `importar.html`). */
export const TEXTOS_IMPORTAR = {
  titulo: "Importar fatura",
  /** O "＋" vai num span `aria-hidden` ao lado: o VoiceOver lê "Importar fatura". */
  botao: "Importar fatura",
  passo_arquivo: "Escolher o PDF",
  passo_senha: "Senha",
  passo_conferir: "Conferir",
  arquivo: "PDF da fatura",
  senha: "Senha do PDF",
  continuar: "Continuar",
  lido_no_pdf: "Lido no PDF",
  importar: "Importar",
  importar_mesmo_assim: "Importar mesmo assim",
  /** Reimportação (História 3.11): o botão destrutivo do aviso. */
  importar_de_novo: "Importar de novo",
  escolher_outro_pdf: "Escolher outro PDF",
  gravando: "Gravando…",
  /** Reimportação: lendo os números do aviso. */
  carregando: "Carregando…",
  progresso: "Progresso da importação",
} as const;

/** Etapas da barra de progresso da importação, na ordem. */
export const ETAPAS_IMPORTACAO = {
  abrindo: "Abrindo PDF",
  lendo: "Lendo lançamentos",
  conferindo: "Conferindo",
  classificando: "Classificando",
} as const;

export type EtapaImportacao = keyof typeof ETAPAS_IMPORTACAO;

/** "Passo 3 de 3 · Conferir". */
export function rotuloPassoImportar(numero: 1 | 2 | 3): string {
  const secao = [TEXTOS_IMPORTAR.passo_arquivo, TEXTOS_IMPORTAR.passo_senha, TEXTOS_IMPORTAR.passo_conferir][numero - 1];
  return rotuloPasso(numero, 3, secao);
}

/** "1 lançamento", "49 lançamentos". */
export function rotuloLancamentos(n: number): string {
  return n === 1 ? "1 lançamento" : `${n} lançamentos`;
}

/** Passo 3: "Fatura de outubro · vence 06/10/26". */
export function tituloFaturaLida(mes: string, vencimento: string): string {
  return `Fatura de ${formatarNomeDoMes(mes)} · vence ${formatarData(vencimento)}`;
}

/** "Total a pagar R$ 7.713,67" (sem o total lido: "Total a pagar não lido"). */
export function rotuloTotalAPagar(lidoCentavos: number | null): string {
  return lidoCentavos === null ? "Total a pagar não lido" : `Total a pagar ${formatarDinheiro(lidoCentavos)}`;
}

/**
 * Como os Lançamentos chegam ao total: "Lançamentos R$ 7.687,77 + saldo
 * anterior R$ 7.483,11 − pagamentos R$ 7.457,21 = R$ 7.713,67".
 */
export function rotuloComposicaoTotal(c: ComposicaoTotalAPagar): string {
  return (
    `Lançamentos ${formatarDinheiro(c.lancamentosCentavos)}` +
    ` + saldo anterior ${formatarDinheiro(c.saldoAnteriorCentavos)}` +
    ` − pagamentos ${formatarDinheiro(c.pagamentosCentavos)}` +
    ` = ${formatarDinheiro(c.calculadoCentavos)}`
  );
}

/** "✓ Bate com o total a pagar" ou "⚠ Diferença de R$ 0,08 para o total a pagar"; sem o lido, null. */
export function rotuloConferenciaTotal(c: ComposicaoTotalAPagar): string | null {
  if (c.diferencaCentavos === null) return null;
  if (c.diferencaCentavos === 0) return "✓ Bate com o total a pagar";
  return `⚠ Diferença de ${formatarDinheiro(Math.abs(c.diferencaCentavos))} para o total a pagar`;
}

/** "Despesas R$ 8.327,39 · Créditos R$ 639,62". */
export function rotuloDespesasCreditos(despesasCentavos: number, creditosCentavos: number): string {
  return `Despesas ${formatarDinheiro(despesasCentavos)} · Créditos ${formatarDinheiro(creditosCentavos)}`;
}

/** "49 lançamentos serão gravados" (um: "1 lançamento será gravado"). */
export function rotuloSeraoGravados(n: number): string {
  return n === 1 ? "1 lançamento será gravado" : `${n} lançamentos serão gravados`;
}

/**
 * Selo da Conferência: "✓ Conferido" ou "⚠ Diferença de R$ 0,08 no cartão
 * final 8673" (sem cartão com diferença, só o total).
 */
export function rotuloConferencia(c: ConferenciaImportacao): string {
  const d = primeiraDiferenca(c);
  if (!d) return "✓ Conferido";
  const valor = `⚠ Diferença de ${formatarDinheiro(d.centavos)}`;
  return d.final ? `${valor} no cartão final ${d.final}` : valor;
}

/** Extração incompleta (EXPERIENCE.md): "Não conseguimos ler todos os lançamentos (lemos 41)…". */
export function textoExtracaoIncompleta(lidos: number): string {
  return `Não conseguimos ler todos os lançamentos (lemos ${lidos}). Você pode importar mesmo assim e corrigir à mão, ou cancelar`;
}

/**
 * Aviso do passo 3 quando o Mês já tem Fatura (História 3.12), com os números
 * do plano que a RPC vai executar: "Esta fatura já foi importada. Importar de
 * novo mantém a classificação dos 44 lançamentos de novembro que continuam na
 * fatura (2 com valor diferente) e traz 3 novos. 1 que não vem mais é apagado;
 * 2 que você mexeu saem da fatura e vão para o Revisar. Os 2 excluídos voltam."
 */
export function avisoReimportar(mes: string, r: ResumoDoPlano, historico = 0): string {
  const nomeMes = formatarNomeDoMes(mes);
  const um = (n: number, singular: string, plural: string) => (n === 1 ? `1 ${singular}` : `${n} ${plural}`);
  const frases: string[] = [];
  if (r.mantidas === 0) {
    frases.push(`não mantém nenhuma classificação (nenhum lançamento da fatura nova bate com os de ${nomeMes})`);
  } else {
    const valor = r.valorMudou === 0 ? "" : ` (${r.valorMudou === 1 ? "1 com valor diferente" : `${r.valorMudou} com valor diferente`})`;
    frases.push(
      `mantém a classificação ${r.mantidas === 1 ? "do 1 lançamento" : `dos ${r.mantidas} lançamentos`} de ${nomeMes} que continua${r.mantidas === 1 ? "" : "m"} na fatura${valor}`,
    );
  }
  const novas = r.novas === 0 ? "" : ` e traz ${um(r.novas, "novo", "novos")}`;
  const principal = `Importar de novo ${frases[0]}${novas}.`;
  const sobras: string[] = [];
  if (r.apagadas > 0) {
    sobras.push(`${um(r.apagadas, "que não vem mais na fatura é apagado", "que não vêm mais na fatura são apagados")}`);
  }
  if (r.sumiram > 0) {
    sobras.push(`${um(r.sumiram, "que você mexeu sai da fatura e vai", "que você mexeu saem da fatura e vão")} para o Revisar`);
  }
  if (r.voltaramAPrevisto > 0) {
    sobras.push(`${um(r.voltaramAPrevisto, "volta a ser previsto", "voltam a ser previstos")}`);
  }
  const resto = sobras.length === 0 ? "" : ` ${sobras.join("; ")}.`;
  const excluidos =
    r.excluidos === 0 ? "" : r.excluidos === 1 ? " O 1 excluído volta." : ` Os ${r.excluidos} excluídos voltam.`;
  const doHistorico =
    historico === 0
      ? ""
      : ` Este mês também tem ${um(historico, "lançamento do histórico da planilha", "lançamentos do histórico da planilha")}, que ${historico === 1 ? "não é tocado" : "não são tocados"}.`;
  return `Esta fatura já foi importada. ${principal}${resto}${excluidos}${doHistorico}`;
}

/** Passo 3 e resumo final: "2 lançamentos saíram da fatura e estão no Revisar". */
export function rotuloSumiramNaReimportacao(n: number): string {
  return n === 1 ? "1 lançamento saiu da fatura e está no Revisar" : `${n} lançamentos saíram da fatura e estão no Revisar`;
}

/** Passo 3 e resumo final: "2 herdaram a classificação da parcela anterior" (uma: "1 herdou…"). */
export function rotuloParcelasHerdadas(n: number): string {
  return n === 1 ? "1 parcela herdou a classificação da parcela anterior" : `${n} parcelas herdaram a classificação da parcela anterior`;
}

/** Passo 3 e resumo final: "3 previstos casaram com a fatura" (um: "1 previsto casou com a fatura"). */
export function rotuloPrevistosCasados(n: number): string {
  return n === 1 ? "1 previsto casou com a fatura" : `${n} previstos casaram com a fatura`;
}

/** Passo 3 e resumo final: "2 previstos não vieram na fatura" (um: "1 previsto não veio na fatura"). */
export function rotuloPrevistosNaoVieram(n: number): string {
  return n === 1 ? "1 previsto não veio na fatura" : `${n} previstos não vieram na fatura`;
}

/** Passo 3: "17 parcelas previstas serão criadas nos próximos meses" (uma: "1 parcela prevista será criada…"). */
export function rotuloPrevistosCriados(n: number): string {
  return n === 1
    ? "1 parcela prevista será criada nos próximos meses"
    : `${n} parcelas previstas serão criadas nos próximos meses`;
}

/** Toast depois de reimportar: "Fatura de novembro importada de novo · 52 lançamentos". */
export function rotuloReimportado(mes: string, n: number): string {
  return `Fatura de ${formatarNomeDoMes(mes)} importada de novo · ${rotuloLancamentos(n)}`;
}

/** Textos do Painel do Mês (História 2.4): `invoice-hero`, `month-switcher` e grade. */
export const TEXTOS_PAINEL = {
  fechado: "Fechado",
  sem_fatura: "Fatura ainda não importada",
  /** Mês só com histórico da planilha (História 3.10): sem Fatura, o hero mostra o total das linhas. */
  total_historico: "Total do histórico",
  do_historico: "Importado da planilha",
  sem_responsavel: "Sem responsável",
  /** O que a grade mostra no lugar de um cadastro vazio (Tipo, Responsável, Status). */
  vazio: "—",
  mes_anterior: "Mês anterior",
  proximo_mes: "Próximo mês",
  meses: "Meses",
  distribuicao: "Distribuição por Responsável",
  grade: "Lançamentos do Mês",
  total: "Total dos lançamentos",
  sem_lancamentos: "Nenhum lançamento neste Mês",
  total_a_pagar: "Total a pagar",
  carregando: "Carregando…",
} as const;

/** Textos da Conferência no Painel (História 2.5): selo, faixa, pílula "Verificar" e bolinha. */
export const TEXTOS_CONFERENCIA = {
  conferido: "✓ Conferido",
  /** Nome acessível da faixa âmbar. */
  faixa: "Diferença na conferência",
  ver_lancamentos: "Ver lançamentos",
  dispensar: "Dispensar",
  /** Pílula do filtro acima da grade. */
  verificar: "Verificar",
  /** Texto acessível da bolinha (e o fim do nome acessível da linha marcada). */
  verificar_lancamento: "verificar este lançamento",
  sem_para_verificar: "Nenhum lançamento para verificar",
  alerta_dispensado: "Alerta dispensado",
} as const;

/** Selo do `invoice-hero`: "✓ Conferido" ou "⚠ Diferença de R$ 720,00". */
export function rotuloSeloConferencia(c: Conferencia): string {
  const valor = valorDaDiferenca(c);
  return valor === null ? TEXTOS_CONFERENCIA.conferido : `⚠ Diferença de ${formatarDinheiro(valor)}`;
}

/**
 * Nome acessível do selo de diferença (botão que liga "Verificar"), sem o
 * "⚠": "Diferença de R$ 720,00, ver lançamentos para verificar".
 */
export function rotuloBotaoDiferenca(c: Conferencia): string {
  const valor = valorDaDiferenca(c) ?? 0;
  return `Diferença de ${formatarDinheiro(valor)}, ver lançamentos para verificar`;
}

/** "8673", "8673 e 9277", "3967, 8673 e 9277". */
function listarFinais(finais: readonly string[]): string {
  if (finais.length <= 1) return finais.join("");
  return `${finais.slice(0, -1).join(", ")} e ${finais[finais.length - 1]}`;
}

/**
 * Frases da faixa âmbar, na ordem: despesas ("A soma dos lançamentos ficou
 * R$ 720,00 abaixo do total da fatura."), créditos ("A soma dos créditos
 * ficou R$ 8,00 acima do total de créditos da fatura.") e cartões ("A
 * diferença está no cartão final 8673." / "…nos cartões finais 8673 e
 * 9277."). Conferido: nenhuma.
 */
export function frasesFaixaConferencia(c: Conferencia): string[] {
  const p = partesDaDiferenca(c);
  const frases: string[] = [];
  const quanto = (centavos: number, sentido: SentidoDiferenca) => `${formatarDinheiro(centavos)} ${sentido}`;
  if (p.despesas) frases.push(`A soma dos lançamentos ficou ${quanto(p.despesas.centavos, p.despesas.sentido)} do total da fatura.`);
  if (p.creditos) {
    frases.push(`A soma dos créditos ficou ${quanto(p.creditos.centavos, p.creditos.sentido)} do total de créditos da fatura.`);
  }
  if (p.cartoes.length === 1) frases.push(`A diferença está no cartão final ${p.cartoes[0]}.`);
  else if (p.cartoes.length > 1) frases.push(`A diferença está nos cartões finais ${listarFinais(p.cartoes)}.`);
  return frases;
}

/** Cabeçalhos da grade de Lançamentos (UX-DR10), na ordem das colunas. */
export const COLUNAS_GRADE = {
  selecao: "Seleção",
  nome: "Nome",
  parcela: "Parcela",
  valor: "Valor",
  tipo: "Tipo",
  responsavel: "Responsável",
  lancado_por: "Lançado por",
  status: "Status",
  /** A coluna do ⋯ (História 2.7). */
  acoes: "Ações",
} as const;

/** O selo do previsto, junto do Nome (História 3.5). */
export const ROTULO_PREVISTO = "Previsto";

/**
 * A origem do previsto no painel (História 3.5): "criado a partir da parcela
 * 05/10 de MAGALU na Fatura de 06/10/26". Sem a linha de origem (a Fatura foi
 * importada de novo), a frase genérica.
 */
export function rotuloOrigemPrevisto(
  origem: { nome: string; parcela: string; vencimento: string | null } | null,
): string {
  if (origem === null) return "criado a partir de uma parcela anterior desta compra";
  const de = origem.parcela ? `da parcela ${origem.parcela} de ${origem.nome}` : `de ${origem.nome}`;
  const fatura = origem.vencimento === null ? "" : ` na Fatura de ${formatarData(origem.vencimento)}`;
  return `criado a partir ${de}${fatura}`;
}

/** A pergunta ao reclassificar a parcela: "Aplicar também aos 3 previstos desta compra?". */
export function perguntaAplicarAosPrevistos(n: number): string {
  return n === 1
    ? "Aplicar também ao 1 previsto desta compra?"
    : `Aplicar também aos ${n} previstos desta compra?`;
}

/**
 * A pergunta ao dar, trocar ou remover o Apelido (História 3.9):
 * "Aplicar a 12 lançamentos de NOME? 2 já têm outro Apelido e serão trocados."
 * Com `depois` nulo (remover): "Remover o Apelido de 12 lançamentos de NOME?".
 */
export function perguntaApelidoEmMassa(n: number, nome: string, comOutro: number, depois: string | null): string {
  const alvo = n === 1 ? "1 lançamento" : `${n} lançamentos`;
  if (depois === null) return `Remover o Apelido de ${alvo} de ${nome}?`;
  const aviso =
    comOutro === 0 ? "" : comOutro === 1 ? " 1 já tem outro Apelido e será trocado." : ` ${comOutro} já têm outro Apelido e serão trocados.`;
  return `Aplicar a ${alvo} de ${nome}?${aviso}`;
}

/** Toast depois de "Aplicar a todos" do Apelido (com "Desfazer"). */
export function rotuloApelidoAplicado(n: number, removido: boolean): string {
  const alvo = n === 1 ? "1 lançamento" : `${n} lançamentos`;
  return removido ? `Apelido removido de ${alvo}` : `Apelido aplicado a ${alvo}`;
}

/** Toast depois de "Aplicar a todos" ou do preenchimento dos previstos. */
export function rotuloPrevistosAtualizados(n: number): string {
  return n === 1 ? "1 previsto atualizado" : `${n} previstos atualizados`;
}

/** Rótulos de `lancado_por` (AD-6). */
export const ROTULOS_LANCADO_POR = {
  fatura: "Fatura",
  sistema: "Sistema",
  manual: "Manual",
  historico: "Histórico",
} as const;

/** Sobrelinha do `invoice-hero`: "Fatura de outubro · vence 06/10/26" (sem Fatura: "Fatura de outubro"). */
export function sobrelinhaFatura(mes: string, vencimento: string | null): string {
  return vencimento === null ? `Fatura de ${formatarNomeDoMes(mes)}` : tituloFaturaLida(mes, vencimento);
}

/** Sobrelinha do hero de um Mês só com histórico da planilha: "Histórico de março". */
export function sobrelinhaHistorico(mes: string): string {
  return `Histórico de ${formatarNomeDoMes(mes)}`;
}

/** Nome acessível do nome do Mês no seletor: "outubro/26, escolher o Mês". */
export function rotuloEscolherMes(mes: string): string {
  return `${formatarMesExtenso(mes)}, escolher o Mês`;
}

/** Item da lista de Meses: "outubro/26, Fechado" (sem Fatura, só o Mês). */
export function rotuloItemMes(mes: string, fechado: boolean): string {
  return fechado ? `${formatarMesExtenso(mes)}, ${TEXTOS_PAINEL.fechado}` : formatarMesExtenso(mes);
}

/** Nome acessível de um segmento ou etiqueta que filtra: "Filtrar por Rafael". */
export function rotuloFiltrarPor(nome: string): string {
  return `Filtrar por ${nome}`;
}

/** A Parcela lida pelo VoiceOver: "parcela 2 de 12"; à vista, vazio. */
export function rotuloParcelaFalada(n: number | null, total: number | null): string {
  return n === null || total === null ? "" : `parcela ${n} de ${total}`;
}

/** "Cartão final 9012". */
export function rotuloCartaoFinal(final: string): string {
  return `Cartão final ${final}`;
}

/** Textos da barra de filtros (História 2.6, `filter-bar`, UX-DR9). */
export const TEXTOS_FILTROS = {
  /** Nome acessível da barra. */
  barra: "Filtros da grade",
  buscar: "Buscar nome ou apelido",
  limpar_filtros: "Limpar filtros",
  limpar: "Limpar",
  aplicar: "Aplicar",
  mais: "Mais",
  sem_resultado: "Nenhum lançamento com esses filtros",
  sem_tipo: "Sem tipo",
  sem_status: "Sem status",
  sem_cartao: "Sem cartão",
  a_vista: "À vista",
  parcelado: "Parcelado",
  ultima_parcela: "Última parcela",
  /** Popover de uma coluna sem nenhum valor (Cartão num Mês sem Lançamentos). */
  sem_opcoes: "Nenhum valor neste Mês",
} as const;

/** Nome de cada coluna que filtra, na ordem da barra. */
export const COLUNAS_FILTRO = {
  responsavel: COLUNAS_GRADE.responsavel,
  tipo: COLUNAS_GRADE.tipo,
  status: COLUNAS_GRADE.status,
  lancado_por: COLUNAS_GRADE.lancado_por,
  parcela: COLUNAS_GRADE.parcela,
  cartao: "Cartão",
} as const;

/** Título do popover: "Responsável (pode marcar vários)". */
export function tituloPopoverFiltro(coluna: string): string {
  return `${coluna} (pode marcar vários)`;
}

/** Pílula: "Responsável" sem escolha; "Responsável: Casal, Rangel" com (o "▾" vai à parte). */
export function rotuloPilulaFiltro(coluna: string, valores: readonly string[]): string {
  return valores.length === 0 ? coluna : `${coluna}: ${valores.join(", ")}`;
}

/** Pílula "Mais": "Mais" ou, guardando filtros ativos, "Mais (1)". */
export function rotuloMaisFiltros(ativos: number): string {
  return ativos === 0 ? TEXTOS_FILTROS.mais : `${TEXTOS_FILTROS.mais} (${ativos})`;
}

/** Nome acessível de uma caixa do popover: "Casal, 3 lançamentos". */
export function rotuloValorFiltro(rotulo: string, contagem: number): string {
  return `${rotulo}, ${rotuloLancamentos(contagem)}`;
}

/** Textos do painel do Lançamento (História 2.7, `side-panel`, UX-DR14) e da seleção da grade. */
export const TEXTOS_LANCAMENTO = {
  /** "＋ Lançamento" no topo do Painel: o "＋" vai num span `aria-hidden`. */
  botao_novo: "Lançamento",
  /** Nome acessível do "＋ Lançamento" (contém o texto visível). */
  rotulo_novo: "Novo lançamento",
  titulo_novo: "Novo lançamento",
  /** Nome acessível do painel lateral. */
  painel: "Painel do lançamento",
  nome: "Nome",
  valor: "Valor",
  data: "Data da compra",
  apelido: "Apelido",
  responsavel: "Responsável",
  tipo: "Tipo",
  status: "Status",
  observacao: "Observação",
  cartao: "Cartão",
  escolha_cartao: "Escolha…",
  corrige_fatura: "Corrige a leitura da fatura",
  sem_tipo: "Sem tipo",
  /** Status vazio vale "não pago" (AD-10). */
  sem_status: "Sem status (não pago)",
  nome_na_fatura: "Nome na fatura:",
  nao_editavel: "· não editável",
  salvando: "Salvando…",
  tentando: "Não salvo, tentando de novo",
  conferencia_ok: "Conferência: ✓",
  incluir: "Incluir",
  excluir: "Excluir",
  abrir: "Abrir",
  excluido: "Excluído",
  excluido_em_outro_aparelho: "Este lançamento foi excluído em outro aparelho",
  confirmar_excluir_titulo: "Excluir lançamento?",
  confirmar_excluir: "Excluir lançamento",
  selecionar_todos: "Selecionar todos",
} as const;

/**
 * A sugestão da fila no painel (História 3.1): "Sugestão: Casal · Saúde",
 * "Sugestão: Casal · Saúde (às vezes Rafael)", "Sugestão: Gatos". Recebe os
 * nomes já resolvidos (cadastro que não existe mais fica de fora); sem
 * Responsável e sem Tipo, null.
 */
export function textoSugestao(responsavel: string | null, tipo: string | null, outros: readonly string[] = []): string | null {
  const partes = [responsavel, tipo].filter((p): p is string => p !== null && p !== "");
  if (partes.length === 0) return null;
  const vezes = outros.filter((o) => o !== "");
  const duvida = vezes.length > 0 ? ` (às vezes ${vezes.join(" ou ")})` : "";
  return `Sugestão: ${partes.join(" · ")}${duvida}`;
}

/** Textos da fila do Revisar (História 3.2, FR-13) e do passo final da importação. */
export const TEXTOS_REVISAR = {
  /** Fila vazia. */
  tudo_revisado: "Tudo revisado. Nada novo neste mês",
  /** Rótulo pequeno sobre a sugestão do item. */
  sugestao: "Sugestão",
  sem_sugestao: "Sem sugestão",
  carregando: "Carregando…",
  /** O nome acessível da lista. */
  lista: "Fila do Revisar",
  confirmar: "Confirmar",
  mudar: "Mudar",
  /** Toast do ✓ e do "Mudar": o "Desfazer" vem do próprio toast. */
  classificado: "Classificado",
  titulo_mudar: "Mudar classificação",
  responsavel: "Responsável",
  tipo: "Tipo",
  escolha: "Escolha…",
  /** Lote (História 3.3): caixas, barra de seleção e janelas. */
  selecionar_todos: "Selecionar todos",
  barra_lote: "Ações em lote",
  limpar: "Limpar",
  responsavel_lote: "Responsável…",
  tipo_lote: "Tipo…",
  aplicar_sugestoes: "Aplicar sugestões",
  titulo_lote_responsavel: "Responsável dos selecionados",
  titulo_lote_tipo: "Tipo dos selecionados",
  /** Nenhum dos marcados tem sugestão completa: nada é gravado. */
  nenhuma_sugestao_completa: "Nenhum dos selecionados tem sugestão completa",
  /** Variante "Valor mudou" (História 3.6): o ✓ mantém a classificação. */
  valor_mudou: "Valor mudou",
  manter_classificacao: "Manter classificação",
  /** Variante "Sumiu na reimportação" (História 3.12): a linha que a Fatura nova não trouxe. */
  sumiu: "Sumiu na reimportação",
  sumiu_dica: "Saiu da fatura",
  excluir: "Excluir",
  linha_excluida: "Lançamento excluído",
  linha_mantida: "Lançamento mantido",
  /** Variante "Não veio na fatura" (História 3.6): o previsto sem par. */
  nao_veio: "Não veio na fatura",
  previsto: "Previsto",
  remover_previsto: "Remover previsto",
  manter: "Manter",
  previsto_removido: "Previsto removido",
  previsto_mantido: "Previsto mantido",
  /** Passo final da importação. */
  ir_para_revisao: "Ir para revisão",
  ver_no_painel: "Ver no Painel",
} as const;

/** Textos da tela Configurações → Regras aprendidas (História 3.4, FR-12). */
export const TEXTOS_REGRAS = {
  vazio: "As Regras aparecem conforme você classifica os lançamentos",
  nenhuma_encontrada: "Nenhuma Regra encontrada",
  buscar: "Buscar Regra",
  carregando: "Carregando…",
  coluna_chave: "Nome",
  coluna_responsavel: "Responsável",
  coluna_tipo: "Tipo",
  coluna_divisao: "Divisão",
  coluna_ultimo_uso: "Última vez usada",
  /** A Divisão chega na 3.8. */
  sem_divisao: "—",
  sem_valor: "—",
  editar: "Editar",
  excluir: "Excluir",
  titulo_editar: "Editar Regra",
  responsavel: "Responsável",
  tipo: "Tipo",
  nenhum: "Nenhum",
  salvar: "Salvar",
  regra_salva: "Regra salva",
  confirmar_excluir: "Excluir Regra",
  /** Toast depois de "Aplicar a todos"; o "Desfazer" vem do próprio toast. */
  reaplicada: "Regra reaplicada",
  mostrar_todas: "Mostrar todas",
} as const;

/** Faixa do filtro "criadas agora" (História 3.10): "Mostrando as 12 Regras criadas agora pela planilha". */
export function rotuloCriadasAgora(quantas: number): string {
  return quantas === 1 ? "Mostrando a Regra criada agora pela planilha" : `Mostrando as ${quantas} Regras criadas agora pela planilha`;
}

/** "às vezes Rafael" / "às vezes Rafael ou Casal". */
export function rotuloAsVezes(nomes: readonly string[]): string {
  return `às vezes ${nomes.join(" ou ")}`;
}

/** "Reaplicar aos lançamentos de Nov/26?" */
export function perguntaReaplicar(mes: string, quantos: number): string {
  const n = quantos === 1 ? "1 muda" : `${quantos} mudam`;
  return `Reaplicar aos lançamentos de ${formatarMes(mes)}? (${n})`;
}

/** Título da confirmação de excluir. */
export function tituloExcluirRegra(chave: string): string {
  return `Excluir a Regra de ${chave}?`;
}

export const DESCRICAO_EXCLUIR_REGRA =
  "Os lançamentos não mudam. As próximas importações deixam de usar esta Regra.";

/** Nome acessível dos botões da linha. */
export function rotuloEditarRegra(chave: string): string {
  return `Editar a Regra de ${chave}`;
}
export function rotuloExcluirRegra(chave: string): string {
  return `Excluir a Regra de ${chave}`;
}

/** "Faltam 17" (um: "Falta 1"). */
export function rotuloFaltam(n: number): string {
  return n === 1 ? "Falta 1" : `Faltam ${n}`;
}

/**
 * Título do grupo com 2+ itens: "SHOPEE · 3 lançamentos". Quando o grupo
 * junta Meses diferentes, eles vêm no fim: "SHOPEE · 3 lançamentos · Out/26 e Nov/26".
 */
export function tituloGrupoRevisar(nome: string, quantidade: number, meses: readonly string[] = []): string {
  const base = `${nome} · ${rotuloLancamentos(quantidade)}`;
  if (meses.length < 2) return base;
  const nomes = meses.map((m) => formatarMes(m));
  const ultimo = nomes[nomes.length - 1];
  return `${base} · ${nomes.length === 2 ? nomes[0] : nomes.slice(0, -1).join(", ")} e ${ultimo}`;
}

/** "2 de 3": o item é o 2º de 3 iguais no mesmo grupo (mesmo Mês, data, parcela e valor). */
export function rotuloRepeticao(posicao: number, total: number): string {
  return `${posicao} de ${total}`;
}

/** Linha menor sob a mãe: "Ajuste - R$ 0,08". */
export function rotuloAjusteDoItem(valorCentavos: number): string {
  return `Ajuste ${formatarDinheiro(valorCentavos)}`;
}

/** Nome acessível do ✓: "Confirmar sugestão de MSC CRUZEIROS". */
export function rotuloConfirmarItem(nome: string): string {
  return `Confirmar sugestão de ${nome}`;
}

/** "Antes R$ 445,89 → agora R$ 449,10" (variante "Valor mudou", História 3.6). */
export function textoValorMudou(antesCentavos: number | null, agoraCentavos: number): string {
  const agora = `agora ${formatarDinheiro(agoraCentavos)}`;
  return antesCentavos === null ? `Valor mudou → ${agora}` : `Antes ${formatarDinheiro(antesCentavos)} → ${agora}`;
}

/** Nome acessível do ✓ de "Valor mudou": "Manter classificação de MAGALU". */
export function rotuloManterClassificacao(nome: string): string {
  return `Manter classificação de ${nome}`;
}

/** Nome acessível de "Remover previsto": "Remover previsto de MAGALU". */
export function rotuloRemoverPrevisto(nome: string): string {
  return `Remover previsto de ${nome}`;
}

/** Nome acessível do "Excluir" de "Sumiu na reimportação": "Excluir lançamento MAGALU". */
export function rotuloExcluirSumiu(nome: string): string {
  return `Excluir lançamento ${nome}`;
}

/** Nome acessível do "Manter" de "Sumiu na reimportação": "Manter lançamento MAGALU". */
export function rotuloManterSumiu(nome: string): string {
  return `Manter lançamento ${nome}`;
}

/** Nome acessível de "Manter": "Manter previsto de MAGALU". */
export function rotuloManterPrevisto(nome: string): string {
  return `Manter previsto de ${nome}`;
}

/** Nome acessível do "Mudar": "Mudar classificação de MSC CRUZEIROS". */
export function rotuloMudarItem(nome: string): string {
  return `Mudar classificação de ${nome}`;
}

/** A contagem da barra de lote: "1 selecionado", "3 selecionados". */
export function rotuloSelecionados(n: number): string {
  return n === 1 ? "1 selecionado" : `${n} selecionados`;
}

/**
 * A barra de Seleção do Painel (História 4.4, FR-48, UX-DR12): "N selecionados ·
 * R$ total", "Limpar", "⋯ Mais" (Classificar em lote, Excluir) e "Gerar mensagem".
 */
export const TEXTOS_SELECAO = {
  /** Nome acessível da barra. */
  barra: "Ações da seleção",
  limpar: "Limpar",
  mais: "Mais",
  classificar_em_lote: "Classificar em lote",
  excluir: "Excluir",
  /** Abre a janela "Gerar mensagem" (História 4.6). */
  gerar_mensagem: "Gerar mensagem",
  /** O aviso de trocar de Mês com Seleção (só quando havia Seleção). */
  limpa_ao_trocar_de_mes: "Seleção limpa ao trocar de mês",
  /** A janela "Classificar em lote". */
  titulo_classificar: "Classificar em lote",
  nao_mudar: "Não mudar",
  observacao: "Observação",
  observacao_dica: "Em branco, não muda",
  escolha_ao_menos_um: "Escolha ao menos um campo para mudar",
  /** O lote não tinha o que gravar (já estava assim, ou só partes de uma Divisão sem Status). */
  nada_a_mudar: "Nada a mudar nos selecionados",
  /** Excluir em lote. */
  titulo_excluir: "Excluir lançamentos?",
  confirmar_excluir: "Excluir lançamentos",
} as const;

/** O aviso de uma classificação em lote que gravou: "3 lançamentos classificados" (o "Desfazer" vem do toast). */
export function rotuloLancamentosClassificados(n: number): string {
  return n === 1 ? "1 lançamento classificado" : `${n} lançamentos classificados`;
}

/** O aviso da exclusão em lote: "3 lançamentos excluídos" (o "Desfazer" vem do toast). */
export function rotuloLancamentosExcluidos(n: number): string {
  return n === 1 ? "1 lançamento excluído" : `${n} lançamentos excluídos`;
}

/**
 * Nota da janela de classificar: as partes de uma Divisão só recebem o Status
 * (o Responsável é delas na Divisão; o Tipo e a Observação seguem a mãe).
 */
export function notaPartesDaDivisao(partes: number): string {
  return partes === 1
    ? "1 parte de uma Divisão só recebe o Status; o resto dela segue a Divisão"
    : `${partes} partes de uma Divisão só recebem o Status; o resto delas segue a Divisão`;
}

/** A descrição da confirmação de Excluir em lote (a parte de uma Divisão não se exclui). */
export function descricaoExcluirEmLote(n: number, ajustes: number, partes: number): string {
  const alvo = n === 1 ? "1 lançamento sai" : `${n} lançamentos saem`;
  const juntos = ajustes === 0 ? "" : ajustes === 1 ? " junto com 1 Ajuste" : ` junto com ${ajustes} Ajustes`;
  const ficam =
    partes === 0
      ? ""
      : partes === 1
        ? " 1 parte de uma Divisão fica (desfaça a Divisão para excluir)."
        : ` ${partes} partes de uma Divisão ficam (desfaça a Divisão para excluir).`;
  return `${alvo} da grade${juntos}. Dá para desfazer logo depois.${ficam}`;
}

/** O botão da janela do lote: "Aplicar a 3". */
export function rotuloAplicarA(n: number): string {
  return `Aplicar a ${n}`;
}

/** Nome acessível da caixa do grupo: "Selecionar todos de SHOPEE". */
export function rotuloSelecionarGrupo(nome: string): string {
  return `Selecionar todos de ${nome}`;
}

/** O aviso de "Aplicar sugestões" com itens sem sugestão completa: "5 classificados · 2 sem sugestão completa". */
export function rotuloClassificadosSemSugestao(classificados: number, semSugestao: number): string {
  return `${rotuloClassificados(classificados)} · ${semSugestao} sem sugestão completa`;
}

/** "1 classificado", "30 classificados". */
export function rotuloClassificados(n: number): string {
  return n === 1 ? "1 classificado" : `${n} classificados`;
}

/** "17 para revisar". */
export function rotuloParaRevisar(n: number): string {
  return `${n} para revisar`;
}

/** "N classificados · N para revisar": o resumo do passo final da importação. */
export function rotuloResumoClassificacao(classificados: number, paraRevisar: number): string {
  return `${rotuloClassificados(classificados)} · ${rotuloParaRevisar(paraRevisar)}`;
}

/**
 * A faixa de resumo da importação no topo do Revisar:
 * "Importação de novembro · ✓ Conferido · 47 lançamentos · 30 classificados · 17 para revisar".
 */
export function rotuloFaixaImportacao(
  mes: string,
  selo: string,
  r: { lancamentos: number; classificados: number; paraRevisar: number },
): string {
  return `Importação de ${formatarNomeDoMes(mes)} · ${selo} · ${rotuloLancamentos(r.lancamentos)} · ${rotuloResumoClassificacao(r.classificados, r.paraRevisar)}`;
}

/** Data do item quando a fila tem mais de um Mês: "Out/26" (do núcleo de datas). */
export function rotuloMesDoItem(mes: string): string {
  return formatarMes(mes);
}

/** "Salvo às 21:14". */
export function rotuloSalvoAs(hora: string): string {
  return `Salvo às ${hora}`;
}

/** "Conferência: diferença de R$ 720,00". */
export function rotuloConferenciaDiferenca(centavos: number): string {
  return `Conferência: diferença de ${formatarDinheiro(centavos)}`;
}

/** "Este lançamento foi alterado em outro aparelho às 21:30". */
export function rotuloAlteradoEmOutroAparelho(hora: string): string {
  return `Este lançamento foi alterado em outro aparelho às ${hora}`;
}

/** Toast de "＋ Lançamento" que caiu em outro Mês: "Lançamento incluído em dezembro/26". */
export function rotuloIncluidoEm(mes: string): string {
  return `Lançamento incluído em ${formatarMesExtenso(mes)}`;
}

/** Caixa de uma linha da grade: "Selecionar MSC CRUZEIROS". */
export function rotuloSelecionar(nome: string): string {
  return `Selecionar ${nome}`;
}

/**
 * Texto da confirmação de exclusão de um Lançamento; só um da Fatura
 * (`daFatura`) sai da Conferência. Com Ajustes, eles saem juntos.
 */
export function descricaoExcluirLancamento(nome: string, daFatura: boolean, ajustes = 0): string {
  const juntos = ajustes === 0 ? "" : ajustes === 1 ? " junto com o Ajuste dele" : ` junto com os ${ajustes} Ajustes dele`;
  return `“${nome}” sai da grade${daFatura ? " e da Conferência" : ""}${juntos}. Dá para desfazer logo depois.`;
}

/** Ajustes de centavos (História 2.8, FR-47). */
/** A janela "Dividir" e os avisos da Divisão (História 3.8, UX-DR15). */
export const TEXTOS_DIVISAO = {
  /** Antes do Nome da filha na grade. */
  marca: "↳",
  titulo: "Dividir lançamento",
  titulo_edicao: "Dividir lançamento",
  botao: "Dividir",
  botao_editar: "Editar divisão",
  desfazer: "Desfazer divisão",
  por_valor: "Por valor",
  por_proporcao: "Por proporção",
  modo: "Como dividir",
  parte: "＋ Parte",
  remover_parte: "Remover parte",
  responsavel: "Responsável",
  fracao: "Fração",
  valor: "Valor",
  status: "Status",
  sem_responsavel: "Escolha…",
  cancelar: "Cancelar",
  dividido: "Dividido",
  /** O que o painel da mãe mostra no lugar do Responsável. */
  responsavel_dividido: "Dividido entre as partes",
  dividido_somente_leitura: "Para corrigir o valor, desfaça a divisão.",
  /** Painel da filha. */
  parte_de: "Parte de",
  abrir_divisao: "Abrir divisão",
  filhas_seguem: "Tipo, Apelido e Observação seguem a divisão.",
  indisponivel_ajuste: "Desvincule o Ajuste de centavos para dividir.",
  indisponivel_tipo: "Escolha o Tipo para dividir.",
  indisponivel_zero: "Valor zero não pode ser dividido.",
  indisponivel_grande: "Valor grande demais para dividir (até R$ 900.000,00).",
  indisponivel_ajuste_proprio: "Um Ajuste de centavos não pode ser dividido.",
  fracoes_nao_fecham: "As frações precisam somar 1 (100%).",
  /** Regras aprendidas: sem Divisão. */
  sem_divisao: "—",
  remover_divisao: "Remover divisão",
  divisao_da_regra: "Divisão",
  desfeita: "Divisão desfeita",
  nenhuma_parte_fora: "Nenhuma",
} as const;

/** "Dividido em 2 partes" (toast depois de dividir). */
export function rotuloDividido(partes: number): string {
  return `Dividido em ${partes} partes`;
}

/** "Soma das partes: R$ 466,00 de R$ 466,00 ✓" (ou sem o ✓ quando não bate). */
export function rotuloSomaDasPartes(somaCentavos: number, totalCentavos: number, bate: boolean): string {
  return `Soma das partes: ${formatarDinheiro(somaCentavos)} de ${formatarDinheiro(totalCentavos)}${bate ? " ✓" : ""}`;
}

/** "(+1 centavo)" na última parte quando o arredondamento deixou a diferença (ou "−2 centavos"). */
export function rotuloDiferencaDeCentavos(centavos: number): string {
  const n = Math.abs(centavos);
  return `(${centavos > 0 ? "+" : "−"}${n} ${n === 1 ? "centavo" : "centavos"})`;
}

/** "Divisão aplicada pela Regra de JIM COM 5765" (modo edição, quando a Divisão veio de uma Regra). */
export function avisoDivisaoDaRegra(chave: string): string {
  return `Divisão aplicada pela Regra de ${chave}`;
}

/** Passo 3 e resumo final: "1 lançamento entra dividido" / "3 lançamentos entram divididos" (pela Regra ou pela parcela anterior). */
export function rotuloDivididosPelaRegra(n: number): string {
  return n === 1 ? "1 lançamento entra dividido" : `${n} lançamentos entram divididos`;
}

/**
 * A Divisão em frações para a lista de Regras: "Mãe 2/3 · Rafael 1/3". Uma
 * Divisão por valor (frações como 31067/46600) mostra a porcentagem com duas
 * casas ("66,67%"); só exibição.
 */
export function textoDaDivisao(d: Divisao, nomeDe: (responsavelId: string) => string): string {
  return rotuloResumoDaDivisao(
    d.partes.map((p) => {
      const centesimos = arredondar(p.numerador * 10_000, p.denominador);
      const percentual = `${Math.floor(centesimos / 100)},${String(centesimos % 100).padStart(2, "0")}%`;
      return { nome: nomeDe(p.responsavel_id), fracao: d.modo === "proporcao" ? `${p.numerador}/${p.denominador}` : percentual };
    }),
  );
}

/** Linha do painel da mãe: "Mãe 2/3 · Rafael 1/3". */
export function rotuloResumoDaDivisao(partes: readonly { nome: string; fracao: string }[]): string {
  return partes.map((p) => `${p.nome} ${p.fracao}`).join(" · ");
}

/** Nome acessível da linha da filha: "Parte de NOME". */
export function rotuloParteDe(nome: string): string {
  return `Parte de ${nome}`;
}

/** Toast: "Dividido em 2 partes · 3 previstos também" (os previstos preenchidos sozinhos). */
export function rotuloDivididoComPrevistos(partes: number, previstos: number): string {
  return `${rotuloDividido(partes)} · ${previstos === 1 ? "1 previsto também" : `${previstos} previstos também`}`;
}

/** Pergunta quando há previstos com outra Divisão: "Dividir também os 2 previstos que já têm outro Responsável?" */
export function perguntaDividirPrevistos(n: number): string {
  return n === 1
    ? "Dividir também o previsto que já tem outro Responsável ou outra divisão?"
    : `Dividir também os ${n} previstos que já têm outro Responsável ou outra divisão?`;
}

export const TEXTOS_AJUSTE = {
  /** Antes do Nome do Ajuste na grade. */
  marca: "↳",
  desvincular: "Desvincular",
  desvinculado: "Desvinculado",
} as const;

/** VoiceOver da linha do Ajuste: "Ajuste de MSC CRUZEIROS". */
export function rotuloAjusteDe(nomeMae: string): string {
  return `Ajuste de ${nomeMae}`;
}

/** VoiceOver da linha do Ajuste: "líquido R$ 1.140,66". */
export function rotuloLiquido(centavos: number): string {
  return `líquido ${formatarDinheiro(centavos)}`;
}

/** Tipo e Responsável do Ajuste, só para leitura: "Segue a parcela MSC CRUZEIROS". */
export function rotuloSegueAParcela(nomeMae: string): string {
  return `Segue a parcela ${nomeMae}`;
}

/** No painel da mãe: "Ajuste - R$ 0,08 · líquido R$ 1.140,66" (os Ajustes somados). */
export function rotuloAjusteDaMae(somaAjustesCentavos: number, liquidoCentavos: number): string {
  return `Ajuste ${formatarDinheiro(somaAjustesCentavos)} · ${rotuloLiquido(liquidoCentavos)}`;
}

/**
 * A linha só de leitura do painel: "Parcela 05/10 · cartão final 8673 ·
 * Lançado por Fatura" (sem Parcela ou sem cartão, a parte some).
 */
export function rotuloDetalhesLancamento(parcela: string, finalCartao: string | null, lancadoPor: string): string {
  const partes: string[] = [];
  if (parcela) partes.push(`Parcela ${parcela}`);
  if (finalCartao) partes.push(`cartão final ${finalCartao}`);
  partes.push(`Lançado por ${lancadoPor}`);
  return partes.join(" · ");
}

/**
 * As duas respostas de toda pergunta do app (EXPERIENCE.md). Constantes
 * únicas: nenhuma tela escreve esses textos por conta própria.
 */
export const RESPOSTAS_PERGUNTA = {
  so_este: "Só este",
  aplicar_a_todos: "Aplicar a todos",
} as const;

export type RespostaPergunta = keyof typeof RESPOSTAS_PERGUNTA;

/** Rótulos de ação repetidos nos componentes comuns. */
export const ROTULOS = {
  tentar_de_novo: "Tentar de novo",
  desfazer: "Desfazer",
  cancelar: "Cancelar",
  fechar: "Fechar",
  sair: "Sair",
  /** O "＋" vai num span `aria-hidden` ao lado: o VoiceOver lê só "Novo". */
  novo: "Novo",
  adicionar: "Adicionar",
  mover_para_cima: "Mover para cima",
  mover_para_baixo: "Mover para baixo",
  arquivar: "Arquivar",
  desarquivar: "Desarquivar",
  arquivado: "Arquivado",
  nome: "Nome",
  nome_novo_responsavel: "Nome do novo Responsável",
  responsaveis: "Responsáveis",
  nome_novo_tipo: "Nome do novo Tipo",
  tipos: "Tipos",
  nome_novo_status: "Nome do novo Status",
  status: "Status",
  conta_como_pago: "Conta como pago",
  status_padrao: "Status padrão das linhas novas",
  nenhum_nao_pago: "Nenhum (não pago)",
  excluir: "Excluir",
  substituir_e_excluir: "Substituir e excluir",
  substituto: "Substituir por",
  escolha: "Escolha…",
  secoes_configuracoes: "Seções de Configurações",
  salvar: "Salvar",
  ciclo: "Ciclo do cartão",
  dia_fechamento: "Dia de fechamento",
  dia_vencimento: "Dia de vencimento",
  nota_ciclo: "O fechamento só define em que mês entram as contas lançadas à mão",
  conferencia: "Conferência e atraso",
  limite_ajuste: "Limite do Ajuste",
  tolerancia_atraso: "Tolerância de atraso (dias)",
  aparencia: "Aparência",
  aparencia_sistema: "Sistema",
  aparencia_claro: "Claro",
  aparencia_escuro: "Escuro",
  primeiro_uso: "Primeiro uso",
  retomar_primeiro_uso: "Retomar o Primeiro uso",
  pular: "Pular",
  continuar: "Continuar",
  concluir: "Concluir",
  voltar: "Voltar",
  voltar_para_salvar: "Voltar para salvar",
  descartar: "Descartar",
  regras_aprendidas: "Regras aprendidas",
  importar_planilha: "Importar planilha",
  blocos: "Blocos",
  modelo_mensagem: "Modelo da mensagem",
} as const;

/**
 * Textos de cada passo do Primeiro uso (mockup `primeiro-uso.html`): o nome
 * da seção, a pergunta e a frase de ajuda. Um passo novo em
 * `PASSOS_PRIMEIRO_USO` sem texto aqui é erro de tipo.
 */
export const TEXTOS_PASSO = {
  responsaveis: {
    secao: ROTULOS.responsaveis,
    pergunta: "Quem divide o cartão com você?",
    ajuda:
      "Cadastre quem paga contas do seu cartão. Pode ser uma pessoa ou um grupo, como “Casal”. Cada um ganha uma cor.",
  },
  tipos: {
    secao: ROTULOS.tipos,
    pergunta: "Como você quer classificar seus gastos?",
    ajuda: "Crie os Tipos que separam seus gastos, como Casa, Mercado ou Viagem.",
  },
  status: {
    secao: ROTULOS.status,
    pergunta: "Como você acompanha o pagamento das contas?",
    ajuda: "Crie os Status das suas contas, como Não pago e Pago, e marque quais contam como pago.",
  },
  planilha: {
    secao: ROTULOS.importar_planilha,
    pergunta: "Quer trazer o histórico da sua planilha?",
    ajuda:
      "Escolha o arquivo .xlsx da planilha “Cartão” e as abas de 2026. O app aprende as Regras e já monta as parcelas em andamento. Dá para pular e fazer depois em Configurações.",
  },
  blocos: {
    secao: ROTULOS.blocos,
    pergunta: "Quais totais você quer ver no Painel?",
    ajuda:
      "Um Bloco é um total com nome, como “Rangel + (Casal ÷ 2)”. Monte tocando nas fichas. Sem Lançamentos ainda, os valores aparecem zerados. Dá para pular e criar depois, no Painel.",
  },
  mensagem: {
    secao: ROTULOS.modelo_mensagem,
    pergunta: "Como você quer escrever a mensagem de cobrança?",
    ajuda:
      "Defina a saudação, a frase do total, a chave Pix e o rodapé, e escolha os campos de cada linha. A prévia mostra como a mensagem vai ficar. Dá para pular e definir depois, em Configurações.",
  },
  ciclo: {
    secao: ROTULOS.ciclo,
    pergunta: "Quando o seu cartão fecha e vence?",
    ajuda: "Informe o dia de fechamento e o de vencimento da fatura. Dá para mudar depois em Configurações.",
  },
} as const satisfies Record<PassoPrimeiroUso, { secao: string; pergunta: string; ajuda: string }>;

/** Cabeçalho do passo: "Passo 1 de 4 · Responsáveis". */
export function rotuloPasso(numero: number, total: number, secao: string): string {
  return `Passo ${numero} de ${total} · ${secao}`;
}

/** Os passos que faltam: "Próximos passos: Tipos → Status → Ciclo do cartão". */
export function rotuloProximosPassos(secoes: readonly string[]): string {
  return `Próximos passos: ${secoes.join(" → ")}`;
}

/** Nome acessível do ⋯ de um item, ex.: "Ações de Rafael". */
export function rotuloAcoesDe(nome: string): string {
  return `Ações de ${nome}`;
}

/** Nome acessível do seletor de cor de um Responsável. */
export function rotuloCorDe(nome: string): string {
  return `Cor de ${nome}`;
}

/** Nome acessível de uma cor do seletor; "em uso" quando outro a tem. */
export function rotuloCor(nomeCor: string, emUso: boolean): string {
  return emUso ? `${nomeCor}, em uso` : nomeCor;
}

/** Quantos registros usam um cadastro: "1 registro", "3 registros". */
export function rotuloRegistros(n: number): string {
  return n === 1 ? "1 registro" : `${n} registros`;
}

/** Título da janela de exclusão em uso: "3 registros usam “Pago”". */
export function tituloEmUso(n: number, nome: string): string {
  return n === 1 ? `1 registro usa “${nome}”` : `${n} registros usam “${nome}”`;
}

/** Título da confirmação de exclusão sem uso: "Excluir “Pago”?". */
export function tituloExcluir(nome: string): string {
  return `Excluir “${nome}”?`;
}

/** Nome acessível da chave "Conta como pago" de um Status. */
export function rotuloContaComoPagoDe(nome: string): string {
  return `${nome} conta como pago`;
}

/** O Ciclo que vale hoje: "Vale hoje (Dez/26): fechamento dia 28, vencimento dia 6". */
export function rotuloCicloAtual(mes: string, fechamento: number, vencimento: number): string {
  return `Vale hoje (${mes}): fechamento dia ${fechamento}, vencimento dia ${vencimento}`;
}

/** A mudança já salva: "A partir de Jan/27: fechamento dia 5, vencimento dia 15". */
export function rotuloProximoCiclo(mes: string, fechamento: number, vencimento: number): string {
  return `A partir de ${mes}: fechamento dia ${fechamento}, vencimento dia ${vencimento}`;
}

/** Textos das Contas manuais (História 5.1, UX-DR24, mockup `contas-manuais.html`). */
export const TEXTOS_CONTAS = {
  botao_nova: "Nova conta",
  rotulo_nova: "Nova conta manual",
  titulo_nova: "Nova conta manual",
  descricao_nova: "Contas que não passam pelo cartão. Elas entram sozinhas nos meses certos.",
  nome: "Nome",
  valor: "Valor por mês",
  valor_parcela: "Valor por parcela",
  repeticao: "Repetição",
  mensal: "Mensal",
  mensal_ate_encerrar: "Mensal até encerrar",
  n_parcelas: "N parcelas",
  parcelas: "Parcelas",
  comeca_em: "Começa em",
  tipo: "Tipo",
  escolha_tipo: "Escolha…",
  escolha_responsavel: "Escolha…",
  observacao: "Observação",
  divisao: "Divisão",
  responsavel: "Responsável",
  valor_da_parte: "Valor da parte",
  mais_parte: "Parte",
  rotulo_mais_parte: "Adicionar parte",
  remover_parte: "Remover parte",
  desde: "desde",
  cancelar: "Cancelar",
  salvar: "Salvar",
  salvando: "Salvando…",
  salvas_agora: "Salvas agora",
  sem_internet: "Sem conexão. Você pode consultar, mas não alterar.",
  nota_passado: "Os meses anteriores também recebem a conta.",
  explicacao_vazio: "As contas que você cadastrar aparecem nos meses certos do Painel.",
} as const;

/** "6 parcelas" ("1 parcela" não existe: o mínimo é 2). */
export function rotuloParcelasDaConta(n: number): string {
  return `${n} parcelas`;
}

/** "Por mês: R$ 318,00 · Total da conta: R$ 1.908,00". */
export function rotuloTotaisDaConta(porMesCentavos: number, totalCentavos: number | null): string {
  const porMes = `Por mês: ${formatarDinheiro(porMesCentavos)}`;
  return totalCentavos === null ? porMes : `${porMes} · Total da conta: ${formatarDinheiro(totalCentavos)}`;
}

/** Nome acessível de uma parte da Divisão: "Valor da parte 2". */
export function rotuloValorDaParte(posicao: number): string {
  return `Valor da parte ${posicao}`;
}

/** Nome acessível do Responsável de uma parte: "Responsável da parte 2". */
export function rotuloResponsavelDaParte(posicao: number): string {
  return `Responsável da parte ${posicao}`;
}

/** "Remover parte 2". */
export function rotuloRemoverParte(posicao: number): string {
  return `Remover parte ${posicao}`;
}

/** O toast depois de salvar: "Conta salva: 6 lançamentos criados" (ou "… já estava salva"). */
export function rotuloContaSalva(criados: number): string {
  if (criados === 0) return "Conta salva: nenhum lançamento novo nos próximos 12 meses";
  return criados === 1 ? "Conta salva: 1 lançamento criado" : `Conta salva: ${criados} lançamentos criados`;
}

export type CodigoMensagem = keyof typeof MENSAGENS;

export function ehCodigoConhecido(codigo: unknown): codigo is CodigoMensagem {
  return (
    typeof codigo === "string" &&
    Object.prototype.hasOwnProperty.call(MENSAGENS, codigo)
  );
}

/** Texto para o usuário. Código desconhecido cai na mensagem genérica. */
export function mensagem(codigo: string | null | undefined): string {
  return ehCodigoConhecido(codigo)
    ? MENSAGENS[codigo]
    : MENSAGENS["erro.desconhecido"];
}


/** Textos de Configurações → Importar planilha (História 3.10, FR-2). */
export const TEXTOS_PLANILHA = {
  descricao:
    "Traga os meses de 2026 da sua planilha “Cartão”. No Google Sheets, use Arquivo → Fazer download → Microsoft Excel (.xlsx) e escolha o arquivo aqui. Ele é lido neste aparelho; nada é enviado ao Google.",
  escolher: "Escolher arquivo",
  trocar: "Escolher outro arquivo",
  lendo: "Lendo o arquivo…",
  abas: "Abas",
  marcar_abas: "Abas para importar",
  previa: "Ver prévia",
  voltar: "Voltar às abas",
  importar: "Importar",
  importando: "Importando…",
  cancelar: "Cancelar",
  aba_com_fatura: "Já tem fatura: só aprende as Regras",
  aba_ja_importada: "Já importada: será substituída",
  aba_digitada: "digitados à mão",
  previa_titulo: "O que vai acontecer",
  novos_cadastros: "Cadastros que faltam",
  nenhum_cadastro: "Nenhum cadastro novo",
  regras_previstas: "Regras novas",
  esperando: "Esperando",
  gravando: "Gravando",
  gravada: "Gravada",
  so_regras: "Só Regras",
  resumo_titulo: "Importação concluída",
  ver_regras: "Ver Regras criadas agora",
  ver_painel: "Ir para o Painel",
  nada_marcado: "Marque ao menos uma aba.",
  historico_titulo: "Apagar histórico importado",
  historico_ajuda:
    "Apaga só as linhas vindas da planilha de um Mês (e as parcelas previstas que elas geraram sem você mexer). Faturas, lançamentos manuais e Regras não são tocados.",
  historico_vazio: "Nenhum Mês tem histórico importado.",
  apagar: "Apagar",
  apagado: "Histórico apagado",
  confirmar_apagar: "Apagar histórico",
} as const;

/** "Não foi possível ler a aba 03/2026". */
export function erroDaAba(nome: string): string {
  return `Não foi possível ler a aba ${nome}`;
}

/** "Prévia da aba": "48 lançamentos · 2 Séries · 14 previstos". */
export function rotuloPreviaDaAba(r: { lancamentos: number; divisoes: number; series: number; previstos: number; digitadosAMao: number }): string {
  const partes = [
    r.lancamentos === 1 ? "1 lançamento" : `${r.lancamentos} lançamentos`,
    r.divisoes > 0 ? (r.divisoes === 1 ? "1 Divisão" : `${r.divisoes} Divisões`) : null,
    r.series > 0 ? (r.series === 1 ? "1 Série" : `${r.series} Séries`) : null,
    r.previstos > 0 ? (r.previstos === 1 ? "1 previsto" : `${r.previstos} previstos`) : null,
    r.digitadosAMao > 0 ? `${r.digitadosAMao} ${TEXTOS_PLANILHA.aba_digitada}` : null,
  ];
  return partes.filter((p) => p !== null).join(" · ");
}

/** "N lançamentos, N Responsáveis, N Tipos, N Regras criadas". */
export function resumoDaImportacao(r: { lancamentos: number; responsaveis: number; tipos: number; regras: number }): string {
  const n = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`;
  return [
    n(r.lancamentos, "lançamento", "lançamentos"),
    n(r.responsaveis, "Responsável", "Responsáveis"),
    n(r.tipos, "Tipo", "Tipos"),
    n(r.regras, "Regra criada", "Regras criadas"),
  ].join(", ");
}

/** Texto do aviso de aba que troca o histórico. */
export function rotuloApagarHistorico(mes: string, quantidade: number): string {
  return `${formatarMes(mes)} · ${quantidade === 1 ? "1 lançamento" : `${quantidade} lançamentos`}`;
}

/** Título da confirmação de apagar o histórico de um Mês. */
export function tituloApagarHistorico(mes: string): string {
  return `Apagar o histórico de ${formatarMes(mes)}?`;
}

/** Textos do Montador de Bloco e do cartão "Blocos" do Painel (História 4.1, UX-DR16). */
export const TEXTOS_BLOCO = {
  titulo_cartao: "Blocos",
  novo: "Novo bloco",
  sem_blocos: "Crie seu primeiro Bloco para ver os totais por pessoa",
  titulo: "Novo bloco",
  titulo_editar: "Editar bloco",
  descricao: "Monte a fórmula tocando nas fichas. Nada é digitado.",
  nome: "Nome",
  formula: "Fórmula",
  area_formula: "Fórmula do Bloco",
  dica_vazia: "Toque nas fichas abaixo",
  dica_remover: "Toque numa ficha para remover",
  responsaveis: "Responsáveis",
  tipos: "Tipos",
  operacoes: "Operações e outros",
  todos: "Todos",
  numero: "Número…",
  responsavel_em_tipo: "Responsável em Tipo…",
  responsavel: "Responsável",
  tipo: "Tipo",
  usar: "Usar",
  campo_numero: "Número",
  usar_numero: "Usar número",
  resultado: "Resultado",
  passo_a_passo: "Passo a passo",
  arredondado: "arredondado só no final",
  usar_em_recebimentos: "Usar em Recebimentos",
  meu_bloco: "É o meu Bloco",
  salvar: "Salvar",
  salvo: "Bloco salvo",
  abrir_parentese: "Abrir parêntese",
  fechar_parentese: "Fechar parêntese",
  sem_fichas: "Não há Responsáveis nem Tipos para escolher. Cadastre-os em Configurações.",
  // Blocos no Painel (História 4.2).
  reordenar: "Reordenar",
  concluir_reordenar: "Concluir",
  inclui_previstos: "inclui previstos",
  editar_formula: "Editar fórmula",
  ver_calculo: "Ver cálculo",
  gerar_mensagem: "Gerar mensagem",
  excluir_bloco: "Excluir bloco",
  titulo_ver_calculo: "Cálculo do bloco",
  descricao_ver_calculo: "O passo a passo do valor que aparece no Painel.",
  fechar: "Fechar",
  excluir_titulo: "Excluir bloco?",
  excluir_confirmar: "Excluir bloco",
  excluir_em_recebimentos: "Este Bloco aparece em Recebimentos.",
  excluido: "Bloco excluído",
  ordem_salva: "Ordem dos Blocos salva",
  carregando: "Carregando os Blocos",
  erro_carregar: "Não foi possível carregar os Blocos.",
  usado_em_recebimentos: "Usado em Recebimentos",
  e_meu_bloco: "É o meu Bloco",
  sem_valor: "—",
  reordenando: "Reordenando os Blocos: arraste ou use mover para antes e depois",
  // Filtrar a grade pelo Bloco (História 4.3).
  filtro_desfeito_excluido: "O Bloco foi excluído e o filtro foi desfeito",
  filtro_desfeito_sem_valor: "O Bloco ficou sem valor e o filtro foi desfeito",
} as const;

/** Nome acessível do 💬 de um Bloco. */
export function rotuloMensagemDoBloco(nome: string): string {
  return `Gerar mensagem do Bloco ${nome}`;
}

/**
 * Nome acessível do cartão que filtra a grade (o estado vai em `aria-pressed`):
 * "Filtrar a grade pelo Bloco Mãe, R$ 1.350,14". Sem valor (a Fórmula não
 * calcula), o cartão não filtra e o nome diz isso.
 */
export function rotuloFiltrarPeloBloco(nome: string, valor: string | null): string {
  const base = `Filtrar a grade pelo Bloco ${nome}`;
  return valor === null ? `${base}, sem valor` : `${base}, ${valor}`;
}

/** Texto da pílula do filtro por Bloco na barra de filtros: "Bloco: Mãe" (o ✕ vai à parte). */
export function rotuloPilulaBloco(nome: string): string {
  return `Bloco: ${nome}`;
}

/** Nome acessível da pílula do Bloco: contém o texto visível e diz o que o toque faz. */
export function rotuloDesfazerFiltroBloco(nome: string): string {
  return `Desfazer o filtro ${rotuloPilulaBloco(nome)}`;
}

/** Nome acessível do ⋯ de um Bloco. */
export function rotuloAcoesDoBloco(nome: string): string {
  return `Ações do Bloco ${nome}`;
}

/** A alça de arrastar de um Bloco no modo Reordenar. */
export function rotuloArrastarBloco(nome: string): string {
  return `Arrastar o Bloco ${nome}`;
}

/** Os botões de mover de um Bloco no modo Reordenar. */
export function rotuloMoverBloco(nome: string, sentido: "antes" | "depois"): string {
  return `Mover o Bloco ${nome} para ${sentido === "antes" ? "antes" : "depois"}`;
}

/** O aviso do Bloco cuja Fórmula cita cadastros arquivados: "Cita Rangel (arquivado)". */
export function avisoCadastrosArquivados(nomes: readonly string[]): string {
  return `Cita ${nomes.join(", ")} (arquivado)`;
}

/** Texto da confirmação de excluir um Bloco; o de cobrança avisa de Recebimentos. */
export function descricaoExcluirBloco(nome: string, deCobranca: boolean): string {
  const base = `O Bloco “${nome}” sai do Painel. Os Lançamentos não mudam.`;
  return deCobranca ? `${TEXTOS_BLOCO.excluir_em_recebimentos} ${base}` : base;
}

/** O nome falado de uma operação, para o botão. */
export const ROTULO_OPERACAO = {
  soma: "Somar",
  subtracao: "Subtrair",
  multiplicacao: "Multiplicar",
  divisao: "Dividir",
} as const;

/** Rótulo do VoiceOver de uma ficha da Fórmula: "Remover Casal". */
export function rotuloRemoverFicha(ficha: string): string {
  return `Remover ${ficha}`;
}

/** Textos de Configurações → Modelo da mensagem e da mensagem em si (História 4.5, FR-23). */
export const TEXTOS_MODELO = {
  /** Fixos do formato (EXPERIENCE.md, "Formato da mensagem"): não são campos do modelo. */
  prefixo_pix: "Pix",
  titulo_detalhes: "Detalhes:",
  rotulo_total: "Total:",
  descricao:
    "Esse é o texto padrão da mensagem de cobrança, igual para todas as pessoas. O título “Detalhes:” e a linha “Total:” no fim entram sozinhos.",
  saudacao: "Saudação",
  frase_total: "Frase do total",
  ajuda_frase: "Escreva {total} onde o valor deve aparecer.",
  chave_pix: "Chave Pix",
  ajuda_pix: "A mensagem escreve “Pix” antes da chave.",
  rodape: "Rodapé",
  campos_da_linha: "Campos da linha de detalhe",
  campo_nome: "Nome ou Apelido",
  campo_parcela: "Parcela",
  campo_valor: "Valor",
  sem_marcador: "A frase não tem {total}. O valor só vai aparecer na linha “Total:” do fim.",
  previa: "Prévia",
  previa_vazia: "O modelo está vazio. Preencha os campos para ver a mensagem.",
  mudou_em_outro_aparelho: "Este modelo mudou em outro aparelho. Seu rascunho continua aqui.",
  usar_modelo_salvo: "Usar o modelo salvo",
  salvo: "Modelo salvo",
} as const;

/** A legenda da prévia: de onde vieram os itens e o que o total quer dizer. */
export function rotuloPrevia(origem: "mes" | "exemplo", quantidade: number, mes: string): string {
  if (origem === "exemplo") {
    return "Prévia com itens de exemplo: o Mês atual ainda não tem lançamentos a cobrar.";
  }
  const itens = quantidade === 1 ? "1 lançamento" : `${quantidade} lançamentos`;
  return `Prévia com ${itens} de ${mes}. O total é o desses itens.`;
}

/**
 * A janela "Gerar mensagem" (História 4.6, FR-24, UX-DR17) e as linhas da
 * mensagem que não são do modelo.
 */
export const TEXTOS_GERAR = {
  titulo: "Gerar mensagem",
  /** Nome do quadro `message` (a caixa de texto só de leitura). */
  quadro: "Mensagem",
  /** Texto de apoio lido com o título quando nada ficou de fora. */
  ajuda: "Confira o texto e copie para colar no WhatsApp.",
  copiar: "Copiar",
  editar_modelo: "Editar modelo",
  /** O toast depois de copiar. */
  copiado: "Copiado",
  falha_ao_copiar: "Não foi possível copiar. Selecione o texto e copie manualmente",
  nada_a_cobrar: "Nada a cobrar nesta seleção",
  incluir_previstos: "Incluir previstos",
  /** O modelo ainda não foi preenchido (nada escrito, nenhuma caixa). */
  modelo_vazio: "O modelo da mensagem está vazio. Preencha em Configurações para gerar a mensagem.",
  /** O modelo tem texto mas nenhuma caixa da linha de detalhe (não deveria ocorrer: a gravação recusa). */
  modelo_sem_campos: "O modelo não tem campos na linha de detalhe. Marque ao menos um em Configurações.",
  /** A mensagem mudou com a janela aberta (outro aparelho mexeu nos lançamentos ou no modelo). */
  mudou: "A mensagem mudou desde que você abriu a janela. Confira o texto antes de copiar.",
  /** O início da linha do Ajuste, logo abaixo da parcela. */
  ajuste: "↳ Ajuste",
  // A mensagem do Bloco, forma 2 (História 4.7, FR-53).
  /** O prefixo do grupo subtraído: "Menos Casal". */
  menos: "Menos",
  /** O nome do grupo de um número solto na Fórmula. */
  valor_fixo: "Valor fixo",
  nada_a_cobrar_bloco: "Nada a cobrar neste bloco",
  bloco_sem_valor: "Este bloco está sem valor. Edite a fórmula para gerar a mensagem.",
  /** O toast quando outro aparelho exclui o Bloco com a janela aberta. */
  bloco_excluido: "O Bloco foi excluído e a janela foi fechada",
} as const;

/** O aviso da forma 2: quanto dos itens já pagos o Bloco deixou de cobrar. */
export function rotuloPagosNaoEntram(valor: string): string {
  return `${valor} já foram pagos e não entram`;
}

/** O aviso de itens que a Fórmula usa em mais de um operando (e por isso contam em cada grupo). */
export function rotuloItensEmVariosGrupos(quantidade: number): string {
  return quantidade === 1
    ? "1 item aparece em mais de um grupo e conta em cada um, como no Painel"
    : `${quantidade} itens aparecem em mais de um grupo e contam em cada um, como no Painel`;
}

/**
 * O aviso dos itens que não entram: "2 itens não entram: 1 já pago, 1 de R$ 0,00".
 * Vazio se nada ficou de fora. Fica na janela, nunca na mensagem.
 */
export function rotuloItensDeFora(
  quantidade: number,
  porMotivo: Readonly<{ pago: number; zero: number; previsto: number }>,
): string {
  if (quantidade <= 0) return "";
  const partes: string[] = [];
  if (porMotivo.pago > 0) partes.push(porMotivo.pago === 1 ? "1 já pago" : `${porMotivo.pago} já pagos`);
  if (porMotivo.zero > 0) partes.push(`${porMotivo.zero} de ${formatarDinheiro(0)}`);
  if (porMotivo.previsto > 0) partes.push(porMotivo.previsto === 1 ? "1 previsto" : `${porMotivo.previsto} previstos`);
  const quem = quantidade === 1 ? "1 item não entra" : `${quantidade} itens não entram`;
  return `${quem}: ${partes.join(", ")}`;
}
