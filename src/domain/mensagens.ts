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
