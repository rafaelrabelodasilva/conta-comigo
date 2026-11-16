"use client";

import { useMemo, useRef, useState } from "react";
import { parcelasRecriaveis } from "@/domain/alterar-conta";
import { formatarMes } from "@/domain/datas";
import {
  TEXTOS_CONTAS as T,
  mensagem,
  rotuloExcluirPergunta,
  rotuloFicamComoEstao,
  rotuloPerguntaExcluir,
} from "@/domain/mensagens";
import type { LeituraDaConta } from "@/data/contas-repo";
import { Botao } from "@/ui/Botao";
import { Janela } from "@/ui/Janela";
import type { ResultadoDoFormulario } from "./FormularioConta";

// Janela "Excluir conta" (História 5.4, FR-18, AD-16). O app pergunta se exclui
// também os Lançamentos previstos dos Meses seguintes: "Excluir também os
// lançamentos" (as parcelas do Mês atual em diante que ainda podem sair) ou
// "Excluir só a conta" (as parcelas ficam como estão). Os Meses anteriores nunca
// mudam, e as parcelas editadas à mão ou já pagas nunca saem (o núcleo as separa
// em `parcelasRecriaveis` e elas vão para o aviso). A exclusão é lógica: o
// "Desfazer" do aviso devolve os mesmos ids (quem abre a janela mostra o aviso).
//
// - A pergunta mostra quantas parcelas podem sair junto assim que a leitura
//   chega; sem a leitura (ou sem conexão) os botões ficam desativados.
// - O foco abre em "Cancelar": excluir nunca é o padrão.

export function JanelaExcluirConta({
  nome,
  mesAtual,
  leitura,
  erroDaLeitura = null,
  online,
  aoMudar,
  aoExcluir,
}: {
  nome: string;
  mesAtual: string;
  /** A leitura dos Lançamentos da Conta: `null` enquanto não chegou. */
  leitura: LeituraDaConta | null;
  /** A leitura falhou: a mensagem (a janela não grava sem ela). */
  erroDaLeitura?: string | null;
  online: boolean;
  aoMudar: (aberta: boolean) => void;
  aoExcluir: (comLancamentos: boolean) => Promise<ResultadoDoFormulario>;
}) {
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const cancelar = useRef<HTMLButtonElement>(null);

  const partes = useMemo(
    () => (leitura === null ? null : parcelasRecriaveis(leitura.existentes, leitura.statusQueContam, mesAtual, leitura.comPagamento)),
    [leitura, mesAtual],
  );

  async function enviar(comLancamentos: boolean) {
    if (salvando || !online || leitura === null) return;
    setSalvando(true);
    setFalha(null);
    const r = await aoExcluir(comLancamentos);
    if (!r.ok) {
      setFalha(mensagem(r.codigo));
      setSalvando(false);
      return;
    }
    aoMudar(false);
  }

  const desativado = salvando || !online || leitura === null;

  return (
    <Janela
      aberta
      aoMudar={(a) => {
        if (!salvando) aoMudar(a);
      }}
      titulo={rotuloPerguntaExcluir(nome)}
      descricao={T.descricao_excluir}
      aoAbrirFoco={(e) => {
        // Excluir nunca é o padrão: o foco abre em "Cancelar".
        e.preventDefault();
        cancelar.current?.focus();
      }}
      rodape={
        <>
          <Botao ref={cancelar} onClick={() => aoMudar(false)} disabled={salvando}>
            {T.cancelar}
          </Botao>
          <Botao variante="destrutivo" onClick={() => void enviar(false)} disabled={desativado}>
            {T.excluir_so_a_conta}
          </Botao>
          <Botao variante="destrutivo" onClick={() => void enviar(true)} disabled={desativado}>
            {T.excluir_com_lancamentos}
          </Botao>
        </>
      }
    >
      <div aria-live="polite" className="flex flex-col gap-2 texto-body text-text-muted">
        {partes === null ? erroDaLeitura === null ? <p>{T.conferindo}</p> : null : <p>{rotuloExcluirPergunta(partes.recriaveis.length, formatarMes(mesAtual))}</p>}
        {partes !== null && partes.mantidas.length > 0 ? (
          <p>
            {rotuloFicamComoEstao(partes.mantidas.map((p) => ({ mesFormatado: formatarMes(p.mes), motivo: p.motivo })))}
          </p>
        ) : null}
      </div>
      {falha ?? erroDaLeitura ? (
        <p role="alert" className="texto-body text-danger-fg">
          {falha ?? erroDaLeitura}
        </p>
      ) : null}
      {!online ? <p className="texto-body text-text-muted">{T.sem_internet}</p> : null}
    </Janela>
  );
}
