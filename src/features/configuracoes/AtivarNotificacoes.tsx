"use client";

import { useEffect, useState } from "react";
import { estaOnline } from "@/data/conexao";
import { repoPush, type RepoPush } from "@/data/push-repo";
import { TEXTOS_NOTIFICACOES, mensagem, textoDoEstadoDasNotificacoes } from "@/domain/mensagens";
import { estadoDasNotificacoes, type AmbienteDeNotificacao } from "@/domain/notificacoes";
import { Botao } from "@/ui/Botao";
import { useToast } from "@/ui/Toast";
import { criarNavegadorDePush, type NavegadorDePush } from "./navegador-de-push";

// "Ativar notificações" (História 7.5, FR-55, AD-13): no grupo Lembretes de Configurações → Aparência, o toque que
// pede a permissão do navegador e guarda a inscrição Web Push DESTE aparelho (cada aparelho tem a sua; iPad e PC
// convivem). No iPad só funciona com o app instalado na tela inicial (iPadOS 18+); no PC, no navegador.
//
// - A permissão só é pedida dentro do manipulador do toque, como a primeira chamada assíncrona (antes de qualquer
//   `await`), e nunca ao abrir a tela. O que é dito sobre este aparelho vem do núcleo (`estadoDasNotificacoes`), sempre
//   em TEXTO (`role="status"`, que não rouba o foco): ativado, desativado, bloqueado (com o caminho para liberar), iPad
//   sem o app instalado (com como instalar), sem suporte e sem chave neste ambiente.
// - A inscrição só fica no navegador se também foi guardada no banco: se o banco recusa, a do navegador é cancelada
//   (o estado nunca diz "ativado" sem o Cron enxergar o aparelho). "Desativar neste aparelho" apaga primeiro a linha
//   do banco e só depois cancela no navegador.
// - Sem conexão nada é tentado (a Central de Avisos do app segue sendo o canal sem a notificação).
// - Erros por toast, como o resto de Configurações; o `endpoint` nunca aparece em texto.

const navegadorReal: { atual: NavegadorDePush | null } = { atual: null };

function navegadorDoAparelho(): NavegadorDePush {
  navegadorReal.atual ??= criarNavegadorDePush(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "");
  return navegadorReal.atual;
}

export function AtivarNotificacoes({
  navegador,
  repo,
  online = estaOnline,
}: {
  /** O navegador (nos testes, um falso). Padrão: o do aparelho. */
  navegador?: NavegadorDePush;
  /** Onde a inscrição é guardada (nos testes, um falso). Padrão: `push_inscricoes` pelo navegador. */
  repo?: Pick<RepoPush, "salvar" | "remover">;
  online?: () => boolean;
}) {
  const toast = useToast();
  const aparelho = navegador ?? navegadorDoAparelho();
  const [ambiente, setAmbiente] = useState<AmbienteDeNotificacao | null>(null);
  const [ocupado, setOcupado] = useState<"ativando" | "desativando" | null>(null);

  useEffect(() => {
    let vivo = true;
    void aparelho.ler().then((lido) => {
      if (vivo) setAmbiente(lido);
    });
    return () => {
      vivo = false;
    };
  }, [aparelho]);

  const estado = ambiente === null ? null : estadoDasNotificacoes(ambiente);

  async function concluirAtivacao(pedido: ReturnType<NavegadorDePush["pedirPermissao"]>) {
    try {
      if ((await pedido) === "granted") {
        const inscricao = await aparelho.inscrever();
        if (inscricao === null) {
          toast.mostrar({ texto: TEXTOS_NOTIFICACOES.erro_ativar });
        } else {
          const resultado = await (repo ?? repoPush()).salvar(inscricao);
          if (!resultado.ok) {
            // Sem a linha no banco o Cron não enxerga o aparelho: não deixa uma inscrição solta no navegador.
            await aparelho.cancelar();
            toast.mostrar({ texto: mensagem(resultado.codigo) });
          }
        }
      }
    } catch {
      toast.mostrar({ texto: TEXTOS_NOTIFICACOES.erro_ativar });
    } finally {
      setAmbiente(await aparelho.ler());
      setOcupado(null);
    }
  }

  function aoAtivar() {
    if (ocupado !== null) return;
    if (!online()) {
      toast.mostrar({ texto: mensagem("conexao.gravar_sem_conexao") });
      return;
    }
    setOcupado("ativando");
    // A permissão é pedida AQUI, dentro do toque, antes de qualquer `await`.
    void concluirAtivacao(aparelho.pedirPermissao());
  }

  async function aoDesativar() {
    if (ocupado !== null) return;
    if (!online()) {
      toast.mostrar({ texto: mensagem("conexao.gravar_sem_conexao") });
      return;
    }
    setOcupado("desativando");
    try {
      const atual = await aparelho.inscricaoAtual();
      const apagada = atual === null ? { ok: true } : await (repo ?? repoPush()).remover(atual.endpoint);
      if (!apagada.ok) {
        toast.mostrar({ texto: TEXTOS_NOTIFICACOES.erro_desativar });
      } else if (!(await aparelho.cancelar())) {
        toast.mostrar({ texto: TEXTOS_NOTIFICACOES.erro_desativar });
      }
    } catch {
      toast.mostrar({ texto: TEXTOS_NOTIFICACOES.erro_desativar });
    } finally {
      setAmbiente(await aparelho.ler());
      setOcupado(null);
    }
  }

  return (
    <div role="group" aria-labelledby="titulo-notificacoes" className="flex flex-col gap-1">
      <h3 id="titulo-notificacoes" className="texto-body-strong">
        {TEXTOS_NOTIFICACOES.titulo}
      </h3>
      <p className="texto-caption text-text-muted">{TEXTOS_NOTIFICACOES.ajuda}</p>
      <p role="status" aria-busy={ambiente === null} className="texto-body text-text">
        {estado === null ? "" : textoDoEstadoDasNotificacoes(estado)}
      </p>
      {estado === "pode_ativar" ? (
        <div>
          <Botao variante="primario" onClick={aoAtivar} disabled={ocupado !== null}>
            {ocupado === "ativando" ? TEXTOS_NOTIFICACOES.ativando : TEXTOS_NOTIFICACOES.ativar}
          </Botao>
        </div>
      ) : null}
      {estado === "ativo" ? (
        <div>
          <Botao onClick={() => void aoDesativar()} disabled={ocupado !== null}>
            {ocupado === "desativando" ? TEXTOS_NOTIFICACOES.desativando : TEXTOS_NOTIFICACOES.desativar}
          </Botao>
        </div>
      ) : null}
    </div>
  );
}
