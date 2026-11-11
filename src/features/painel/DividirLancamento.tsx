"use client";

import { useState } from "react";
import type { Divisao, ItemDividir } from "@/domain/divisao";
import {
  TEXTOS_DIVISAO as T,
  mensagem,
  perguntaDividirPrevistos,
  rotuloDividido,
  rotuloDivididoComPrevistos,
  rotuloPrevistosAtualizados,
  type RespostaPergunta,
} from "@/domain/mensagens";
import { repoLancamentos, type LinhaLancamento, type RepoLancamentos } from "@/data/lancamentos-repo";
import { FaixaPergunta } from "@/ui/FaixaPergunta";
import { Janela } from "@/ui/Janela";
import { useToast } from "@/ui/Toast";
import { JanelaDividir } from "./JanelaDividir";
import type { CadastrosPainel } from "./PainelLancamento";

// Controlador da Divisão (História 3.8): abre a janela "Dividir" para a linha
// `alvoId`, grava pelo repositório e conta o resultado em toasts. O "Desfazer"
// do toast devolve a mãe (e os previstos que a ação preencheu) ao que eram.
// Previstos com outro Responsável ou outra Divisão voltam como a pergunta
// "Só este / Aplicar a todos" (como a 3.5), numa janela própria.

export type PropsDividirLancamento = {
  /** A mãe a dividir; `null` fecha tudo. */
  alvoId: string | null;
  aoFechar: () => void;
  /** Os Lançamentos do Mês aberto (a memória), com as filhas e os excluídos. */
  linhas: readonly LinhaLancamento[];
  cadastros: Pick<CadastrosPainel, "responsaveis" | "status">;
  statusPadraoId: string | null;
  /** Para os testes; padrão, o repositório do navegador. */
  repo?: RepoLancamentos;
};

export function DividirLancamento({ alvoId, aoFechar, linhas, cadastros, statusPadraoId, repo = repoLancamentos() }: PropsDividirLancamento) {
  const toast = useToast();
  const [pendentes, setPendentes] = useState<ItemDividir[]>([]);

  const linha = alvoId === null ? undefined : linhas.find((l) => l.id === alvoId && l.excluido_em === null);
  const filhas = linha ? linhas.filter((f) => f.dividido_de_id === linha.id && f.excluido_em === null) : [];
  const temAjuste = linha ? linhas.some((a) => a.ajuste_de_id === linha.id && a.excluido_em === null) : false;

  function desfazerPeloToast(itens: readonly ItemDividir[]) {
    void repo.restaurarDivisao(itens).then((d) => {
      if (!d.ok) toast.mostrar({ texto: mensagem(d.codigo) });
    });
  }

  async function dividir(divisao: Divisao, status: readonly (string | null)[]): Promise<boolean> {
    if (!linha) return false;
    const r = await repo.dividir(linha.id, divisao, status);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return false;
    }
    toast.mostrar({
      texto: r.preenchidos > 0 ? rotuloDivididoComPrevistos(divisao.partes.length, r.preenchidos) : rotuloDividido(divisao.partes.length),
      aoDesfazer: () => desfazerPeloToast(r.desfazer),
    });
    setPendentes(r.aPerguntar);
    return true;
  }

  async function desfazer(): Promise<boolean> {
    if (!linha) return false;
    const r = await repo.desfazerDivisao(linha.id);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return false;
    }
    toast.mostrar({ texto: T.desfeita, aoDesfazer: () => desfazerPeloToast(r.desfazer) });
    setPendentes(r.aPerguntar);
    return true;
  }

  async function responder(resposta: RespostaPergunta) {
    const itens = pendentes;
    setPendentes([]);
    if (resposta === "so_este" || itens.length === 0) return;
    const r = await repo.aplicarDivisaoAosPrevistos(itens);
    toast.mostrar({ texto: r.ok ? rotuloPrevistosAtualizados(r.gravados) : mensagem(r.codigo) });
  }

  return (
    <>
      {linha ? (
        <JanelaDividir
          // Reabre do zero a cada linha.
          key={linha.id}
          aberta
          aoMudar={(aberta) => {
            if (!aberta) aoFechar();
          }}
          linha={linha}
          filhas={filhas}
          temAjuste={temAjuste}
          cadastros={cadastros}
          statusPadraoId={statusPadraoId}
          aoDividir={dividir}
          aoDesfazer={desfazer}
        />
      ) : null}
      <Janela
        aberta={pendentes.length > 0}
        aoMudar={(aberta) => {
          if (!aberta) setPendentes([]);
        }}
        titulo={T.titulo}
      >
        <FaixaPergunta pergunta={perguntaDividirPrevistos(pendentes.length)} aoResponder={(r) => void responder(r)} />
      </Janela>
    </>
  );
}
