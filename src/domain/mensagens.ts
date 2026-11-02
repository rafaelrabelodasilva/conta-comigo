// Mapa único `codigo → mensagem` (AD de erros). Todo texto mostrado ao
// usuário a partir de um código de erro ou aviso sai daqui. A História 1.3
// estende este mapa com os códigos das telas seguintes.
//
// Regras: os códigos são estáveis (podem ir para o log); as mensagens são
// para a pessoa e podem mudar. Erro de login nunca diz qual campo errou.

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
} as const;

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
  secoes_configuracoes: "Seções de Configurações",
} as const;

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
