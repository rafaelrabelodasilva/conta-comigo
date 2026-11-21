import { deveReativarNotificacoes, estadoDasNotificacoes, type MarcaDeNotificacao } from "@/domain/notificacoes";
import type { RepoPush } from "@/data/push-repo";
import type { NavegadorDePush } from "./navegador-de-push";

// Refazer a inscrição Web Push que o navegador perdeu (Defeito 8, História 7.5). O service worker não trata
// `pushsubscriptionchange` (não tem a sessão do Supabase para gravar a inscrição nova: AD-3, AD-12, e uma rota sem
// sessão abriria uma superfície nova). Quem refaz é o app, quando abre: se a permissão JÁ está dada, o aparelho já
// esteve ativado e não há inscrição neste aparelho, inscreve de novo e grava (uma gravação a mais ao abrir). A
// permissão nunca é pedida aqui (isso é do toque do Rafael), e quem tocou em "Desativar neste aparelho" nunca é
// reativado à força: a `marca` do aparelho diz `desativada`.
//
// A regra de "deve reativar?" é do núcleo (`deveReativarNotificacoes`); este arquivo só lê o aparelho, chama o
// navegador e o repositório e guarda a marca. Nunca lança e nunca registra o `endpoint` (é segredo).

/** Evento que avisa a tela de Configurações (se aberta) de que o aparelho foi reativado: ela relê o estado. */
export const EVENTO_NOTIFICACOES_REATIVADAS = "conta-comigo:notificacoes-reativadas";

const CHAVE_DA_MARCA = "conta-comigo:notificacoes";

/** A marca deste aparelho (`localStorage`, só uma conveniência do aparelho: some se o armazenamento for limpo). */
export type MarcaDoAparelho = {
  ler(): MarcaDeNotificacao | null;
  gravar(marca: MarcaDeNotificacao): void;
};

export const marcaDoAparelho: MarcaDoAparelho = {
  ler() {
    try {
      const valor = localStorage.getItem(CHAVE_DA_MARCA);
      return valor === "ativa" || valor === "desativada" ? valor : null;
    } catch {
      return null;
    }
  },
  gravar(marca) {
    try {
      localStorage.setItem(CHAVE_DA_MARCA, marca);
    } catch {
      // Sem armazenamento (janela privada, dados bloqueados): o app só não reativa sozinho.
    }
  },
};

export type ResultadoDaReativacao = "reativou" | "nada" | "falhou";

/**
 * Confere este aparelho e, se a inscrição sumiu e o Rafael não a desativou, refaz e grava. `"nada"`: não era o caso
 * (ou sem conexão); `"reativou"`: refeita e gravada; `"falhou"`: era o caso, mas o navegador ou o banco recusou (a
 * inscrição solta é cancelada, como no "Ativar": nunca fica uma inscrição que o Cron não enxerga).
 */
export async function reativarNotificacoesSeNecessario(deps: {
  navegador: NavegadorDePush;
  repo: Pick<RepoPush, "salvar">;
  marca?: MarcaDoAparelho;
  online?: () => boolean;
}): Promise<ResultadoDaReativacao> {
  const { navegador, repo, marca = marcaDoAparelho, online = () => true } = deps;
  try {
    const ambiente = await navegador.ler();
    // Já ativo: só lembra que este aparelho esteve ativado (quem ativou antes desta correção também é coberto).
    if (estadoDasNotificacoes(ambiente) === "ativo") {
      if (marca.ler() !== "ativa") marca.gravar("ativa");
      return "nada";
    }
    if (!deveReativarNotificacoes(ambiente, marca.ler())) return "nada";
    if (!online()) return "nada";
    const inscricao = await navegador.inscrever();
    if (inscricao === null) return "falhou";
    const gravada = await repo.salvar(inscricao);
    if (!gravada.ok) {
      await navegador.cancelar();
      return "falhou";
    }
    return "reativou";
  } catch {
    return "falhou";
  }
}
