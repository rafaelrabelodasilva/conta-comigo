"use client";

import { useEffect } from "react";
import { estaOnline } from "@/data/conexao";
import { repoPush, type RepoPush } from "@/data/push-repo";
import { TEXTOS_NOTIFICACOES } from "@/domain/mensagens";
import { useToast } from "@/ui/Toast";
import { criarNavegadorDePush, type NavegadorDePush } from "./navegador-de-push";
import {
  EVENTO_NOTIFICACOES_REATIVADAS,
  marcaDoAparelho,
  reativarNotificacoesSeNecessario,
  type MarcaDoAparelho,
} from "./reativar-notificacoes";

// Refaz sozinho a inscrição de notificações que o navegador perdeu (Defeito 8, História 7.5), uma vez por abertura
// do app, nas telas autenticadas. Não desenha nada: se refez, diz em texto ("Notificações reativadas neste
// aparelho.") e avisa a tela de Configurações, se estiver aberta, para ela reler o estado. Nunca pede permissão (ver
// `reativar-notificacoes.ts`); sem conexão, sem permissão dada ou com o aparelho desativado pelo Rafael, não faz nada.

/** Uma tentativa por abertura do app (o layout não remonta ao navegar, e o modo estrito do React roda o efeito duas vezes). */
let jaTentouNestaAbertura = false;

/** Só para os testes. */
export function reiniciarReativacaoDestaAbertura(): void {
  jaTentouNestaAbertura = false;
}

export function ReativarNotificacoes({
  navegador,
  repo,
  marca = marcaDoAparelho,
  online = estaOnline,
}: {
  /** O navegador (nos testes, um falso). Padrão: o do aparelho. */
  navegador?: NavegadorDePush;
  /** Onde a inscrição é guardada (nos testes, um falso). */
  repo?: Pick<RepoPush, "salvar">;
  marca?: MarcaDoAparelho;
  online?: () => boolean;
}) {
  const toast = useToast();

  useEffect(() => {
    if (jaTentouNestaAbertura) return;
    jaTentouNestaAbertura = true;
    void reativarNotificacoesSeNecessario({
      navegador: navegador ?? criarNavegadorDePush(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""),
      repo: repo ?? repoPush(),
      marca,
      online,
    }).then((resultado) => {
      if (resultado !== "reativou") return;
      toast.mostrar({ texto: TEXTOS_NOTIFICACOES.reativadas });
      window.dispatchEvent(new Event(EVENTO_NOTIFICACOES_REATIVADAS));
    });
    // Uma vez por abertura: nada aqui depende de props que mudem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
