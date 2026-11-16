"use client";

import { useEffect, useRef, useState } from "react";
import { resumirDesfazer } from "@/domain/historico-pagamentos";
import {
  ROTULOS,
  TEXTOS_HISTORICO as T,
  mensagem,
  rotuloFicamPorPagamentoPosterior,
  rotuloFicamPorStatusMudado,
  rotuloSaiDoHistorico,
  rotuloSoParciais,
  rotuloVoltamAoStatusAnterior,
} from "@/domain/mensagens";
import type { RepoPagamentos } from "@/data/pagamentos-repo";
import { Botao } from "@/ui/Botao";
import { Janela } from "@/ui/Janela";

// Confirmação do "Desfazer pagamento" (História 6.3, FR-25, AD-10, AD-16). A janela diz o que muda
// ANTES de confirmar: quantas linhas voltam ao Status anterior, quantas ficam como estão (e por quê)
// e que o valor recebido sai do histórico. Quem classifica as linhas é o núcleo
// (`classificarDesfazerPagamento`, pelo repositório); aqui só se mostra e se confirma.
//
// - O foco abre em "Cancelar": desfazer nunca é o padrão (como Excluir conta).
// - Ao confirmar, o repositório lê de novo e só grava se o plano de agora for o que a janela mostrou
//   (`esperado`); se outro aparelho mexeu numa linha, vem `pagamento.mudou`: nada é gravado, a janela
//   relê, mostra o aviso e o novo resumo, e Rafael confirma de novo.
// - Se o Pagamento já foi desfeito em outro aparelho (`pagamento.ja_desfeito` ou `nao_encontrado`),
//   a janela fecha e a tela avisa.
// - Sem conexão a janela não grava (AD-3): o botão fica desativado.

type Previa = Awaited<ReturnType<RepoPagamentos["previaDoDesfazer"]>>;

export function JanelaDesfazerPagamento({
  pagamentoId,
  valorRecebidoCentavos,
  data,
  ajustes,
  online,
  repo,
  aoMudar,
  aoTrabalhar,
  aoDesfeito,
  aoJaDesfeito,
}: {
  pagamentoId: string;
  valorRecebidoCentavos: number;
  data: string;
  /** As linhas que são Ajuste de centavos (seguem a parcela e não entram na contagem). */
  ajustes: ReadonlySet<string>;
  online: boolean;
  repo: Pick<RepoPagamentos, "previaDoDesfazer" | "desfazer">;
  aoMudar: (aberta: boolean) => void;
  /** Avisa a tela de que a gravação começou (ou terminou): o sumiço do Pagamento é desta janela, não de outro aparelho. */
  aoTrabalhar: (trabalhando: boolean) => void;
  /** Desfeito: o valor recebido vai para o aviso (a tela pode já não ter o Pagamento na memória). */
  aoDesfeito: (valorRecebidoCentavos: number) => void;
  /** Precisa ser estável (`useCallback`): a janela o usa na leitura da prévia. */
  aoJaDesfeito: () => void;
}) {
  // A prévia carrega a tentativa a que pertence: a de antes de um "mudou" nunca vale para a atual.
  const [tentativa, setTentativa] = useState(0);
  const [guardada, setGuardada] = useState<{ tentativa: number; previa: Previa } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mudou, setMudou] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const cancelar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let vale = true;
    void repo.previaDoDesfazer(pagamentoId).then((previa) => {
      if (!vale) return;
      if (!previa.ok && previa.codigo === "pagamento.ja_desfeito") {
        aoJaDesfeito();
        return;
      }
      setGuardada({ tentativa, previa });
    });
    return () => {
      vale = false;
    };
  }, [repo, pagamentoId, tentativa, aoJaDesfeito]);

  const previa = guardada !== null && guardada.tentativa === tentativa ? guardada.previa : null;
  const itens = previa !== null && previa.ok ? previa.itens : null;
  const erroDaPrevia = previa !== null && !previa.ok ? mensagem(previa.codigo) : null;
  const resumo = itens === null ? null : resumirDesfazer(itens, ajustes);

  async function confirmar() {
    if (salvando || !online || itens === null) return;
    setSalvando(true);
    setFalha(null);
    setMudou(false);
    aoTrabalhar(true);
    const r = await repo.desfazer(pagamentoId, itens);
    if (r.ok) {
      aoTrabalhar(false);
      aoDesfeito(valorRecebidoCentavos);
      return;
    }
    aoTrabalhar(false);
    if (r.codigo === "pagamento.ja_desfeito" || r.codigo === "pagamento.nao_encontrado") {
      aoJaDesfeito();
      return;
    }
    setSalvando(false);
    if (r.codigo === "pagamento.mudou") {
      // Outro aparelho mexeu numa linha: relê o que muda e pede a confirmação de novo.
      setMudou(true);
      setTentativa((t) => t + 1);
      return;
    }
    setFalha(mensagem(r.codigo));
  }

  const desativado = salvando || !online || itens === null;

  return (
    <Janela
      aberta
      aoMudar={(a) => {
        if (!salvando) aoMudar(a);
      }}
      titulo={T.confirmar_titulo}
      aoAbrirFoco={(e) => {
        // Desfazer nunca é o padrão: o foco abre em "Cancelar".
        e.preventDefault();
        cancelar.current?.focus();
      }}
      rodape={
        <>
          <Botao ref={cancelar} onClick={() => aoMudar(false)} disabled={salvando}>
            {ROTULOS.cancelar}
          </Botao>
          <Botao variante="destrutivo" onClick={() => void confirmar()} disabled={desativado}>
            {T.confirmar_botao}
          </Botao>
        </>
      }
    >
      <div aria-live="polite" className="flex flex-col gap-2 texto-body text-text-muted">
        {resumo === null ? (
          erroDaPrevia === null ? (
            <p>{T.confirmar_conferindo}</p>
          ) : null
        ) : (
          <>
            <p>{rotuloSaiDoHistorico(valorRecebidoCentavos, data)}</p>
            <p>{resumo.voltam > 0 ? rotuloVoltamAoStatusAnterior(resumo.voltam) : T.confirmar_nada_muda}</p>
            {resumo.ficamStatusMudou > 0 ? <p>{rotuloFicamPorStatusMudado(resumo.ficamStatusMudou)}</p> : null}
            {resumo.ficamPagamentoPosterior > 0 ? <p>{rotuloFicamPorPagamentoPosterior(resumo.ficamPagamentoPosterior)}</p> : null}
            {resumo.parciais > 0 ? <p>{rotuloSoParciais(resumo.parciais)}</p> : null}
          </>
        )}
      </div>
      {mudou ? (
        <p role="alert" className="texto-body text-danger-fg">
          {mensagem("pagamento.mudou_desfazer")}
        </p>
      ) : null}
      {falha ?? erroDaPrevia ? (
        <p role="alert" className="texto-body text-danger-fg">
          {falha ?? erroDaPrevia}
        </p>
      ) : null}
      {!online ? <p className="texto-body text-text-muted">{T.sem_internet}</p> : null}
    </Janela>
  );
}
