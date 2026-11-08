// Mapa único `codigo → mensagem` (AD de erros). Todo texto mostrado ao
// usuário a partir de um código de erro ou aviso sai daqui. A História 1.3
// estende este mapa com os códigos das telas seguintes.
//
// Regras: os códigos são estáveis (podem ir para o log); as mensagens são
// para a pessoa e podem mudar. Erro de login nunca diz qual campo errou.

import type { PassoPrimeiroUso } from "./primeiro-uso";
import { partesDaDiferenca, valorDaDiferenca, type Conferencia, type SentidoDiferenca } from "./conferencia";
import { formatarData, formatarMesExtenso, formatarNomeDoMes } from "./datas";
import { formatarDinheiro } from "./dinheiro";
import {
  primeiraDiferenca,
  type ComposicaoTotalAPagar,
  type ConferenciaImportacao,
} from "./importacao-fatura";

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
  "divisao.fracoes_invalidas": "As frações da divisão precisam somar 100%.",
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
  "lancamento.nome_vazio": "Preencha o nome.",
  "lancamento.nome_longo": "Use até 200 caracteres.",
  "lancamento.valor_vazio": "Preencha o valor.",
  "lancamento.valor_invalido": "Valor inválido. Use, por exemplo, 1,50.",
  "lancamento.valor_zero": "O valor não pode ser zero.",
  "lancamento.data_invalida": "Data inválida.",
  "lancamento.data_da_fatura": "Um lançamento da fatura precisa de data.",
  "lancamento.apelido_longo": "Use até 60 caracteres.",
  "lancamento.observacao_longa": "Use até 500 caracteres.",
  "lancamento.sem_cartao": "Escolha o cartão",
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
  escolher_outro_pdf: "Escolher outro PDF",
  gravando: "Gravando…",
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

/** Textos do Painel do Mês (História 2.4): `invoice-hero`, `month-switcher` e grade. */
export const TEXTOS_PAINEL = {
  fechado: "Fechado",
  sem_fatura: "Fatura ainda não importada",
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

/** Texto da confirmação de exclusão de um Lançamento; só um da Fatura (`daFatura`) sai da Conferência. */
export function descricaoExcluirLancamento(nome: string, daFatura: boolean): string {
  return `“${nome}” sai da grade${daFatura ? " e da Conferência" : ""}. Dá para desfazer logo depois.`;
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
