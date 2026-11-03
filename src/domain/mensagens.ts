// Mapa único `codigo → mensagem` (AD de erros). Todo texto mostrado ao
// usuário a partir de um código de erro ou aviso sai daqui. A História 1.3
// estende este mapa com os códigos das telas seguintes.
//
// Regras: os códigos são estáveis (podem ir para o log); as mensagens são
// para a pessoa e podem mudar. Erro de login nunca diz qual campo errou.

import type { PassoPrimeiroUso } from "./primeiro-uso";
import type { ItemQuadro } from "./prova-fatura";

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
} as const;

/**
 * Textos da página de prova técnica da fatura (História 2.1, `/prova-fatura`,
 * fora do menu). A página some na 2.3.
 */
export const TEXTOS_PROVA_FATURA = {
  titulo: "Prova técnica da fatura",
  explicacao:
    "Abre o PDF com a senha neste aparelho, tira CPF, endereço e número do cartão, e manda só o texto para a leitura. Nada é gravado.",
  arquivo: "PDF da fatura",
  senha: "Senha do PDF",
  ler: "Ler fatura",
  abrindo: "Abrindo PDF…",
  lendo: "Lendo lançamentos…",
  baixar_texto: "Baixar texto sem dados pessoais",
  quadro: "Esperado × lido",
  coluna_item: "Item",
  coluna_esperado: "Esperado",
  coluna_lido: "Lido",
  coluna_ok: "Bateu?",
  bateu: "Sim",
  nao_bateu: "Não",
  tempos: "Tempos",
  tempo_abrir: "Abrir o PDF",
  tempo_servidor: "Servidor",
  tempo_gemini: "Gemini",
  tempo_total: "Total",
  dados_fatura: "Dados lidos da fatura",
  vencimento: "Vencimento",
  fechamento: "Fechamento",
  saldo_anterior: "Saldo anterior",
  pagamentos: "Pagamentos",
  total_a_pagar: "Total a pagar",
  com_duvida: "Lançamentos com dúvida",
  nao_lido: "não lido",
  por_cartao: "Por cartão",
  lista: "Lançamentos lidos",
  coluna_nome: "Nome",
  coluna_data: "Data",
  coluna_parcela: "Parcela",
  coluna_valor: "Valor",
  coluna_cartao: "Cartão",
  coluna_tipo: "Tipo sugerido",
  coluna_duvida: "Dúvida",
  duvida_sim: "Sim",
} as const;

/** Rótulo de cada linha do quadro da prova; uma linha nova sem texto é erro de tipo. */
export const ITENS_QUADRO_PROVA = {
  quantidade: "Lançamentos",
  despesas: "Soma das despesas",
  creditos: "Soma dos créditos",
  total_despesas_lido: "Total de despesas da fatura",
  total_creditos_lido: "Total de créditos da fatura",
  cartoes: "Soma dos cartões = despesas",
  sem_pagamento_anterior: "Pagamento da fatura anterior na lista",
  tempo_total: "Tempo total",
} as const satisfies Record<ItemQuadro, string>;

/** "Cartão final 9012". */
export function rotuloCartaoFinal(final: string): string {
  return `Cartão final ${final}`;
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
