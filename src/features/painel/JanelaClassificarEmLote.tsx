"use client";

import { useState } from "react";
import {
  ROTULOS,
  TEXTOS_LANCAMENTO,
  TEXTOS_SELECAO as T,
  notaPartesDaDivisao,
  rotuloAplicarA,
  rotuloSelecionados,
} from "@/domain/mensagens";
import { STATUS_NENHUM, montarCamposDoLote, type EscolhaDoLote } from "@/domain/selecao";
import type { CamposDoLote } from "@/domain/lote";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { Janela } from "@/ui/Janela";
import { Seletor } from "@/ui/Seletor";

// "Classificar em lote" do menu ⋯ Mais da barra de Seleção (História 4.4): atribui
// Responsável, Tipo, Status e Observação às marcadas pela função da História 3.3
// (`classificarEmLote`), numa gravação só (tudo ou nada). Cada campo começa em
// "Não mudar"; só o que Rafael escolhe é gravado. A gravação é de quem abre a
// janela (`aoAplicar`), que a fecha quando dá certo; se falha, a janela fica e
// a Seleção também.

type Cadastro = { id: string; nome: string };

export type PropsJanelaClassificarEmLote = {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  quantidade: number;
  /** Quantas marcadas são partes de uma Divisão (só recebem o Status). */
  partes: number;
  /** Só os ativos, já na ordem do cadastro. */
  responsaveis: readonly Cadastro[];
  tipos: readonly Cadastro[];
  status: readonly Cadastro[];
  /** Grava os campos escolhidos em todas as marcadas; devolve se deu certo. */
  aoAplicar: (campos: CamposDoLote) => Promise<boolean>;
};

const ESCOLHA_VAZIA: EscolhaDoLote = { responsavelId: "", tipoId: "", status: "", observacao: "" };

export function JanelaClassificarEmLote({
  aberta,
  aoMudar,
  quantidade,
  partes,
  responsaveis,
  tipos,
  status,
  aoAplicar,
}: PropsJanelaClassificarEmLote) {
  const [escolha, setEscolha] = useState<EscolhaDoLote>(ESCOLHA_VAZIA);
  const [aplicando, setAplicando] = useState(false);
  const campos = montarCamposDoLote(escolha);
  const nada = Object.keys(campos).length === 0;
  const opcoes = (lista: readonly Cadastro[], extra: { valor: string; rotulo: string }[] = []) => [
    { valor: "", rotulo: T.nao_mudar },
    ...lista.map((c) => ({ valor: c.id, rotulo: c.nome })),
    ...extra,
  ];

  async function aplicar() {
    if (nada || aplicando) return;
    setAplicando(true);
    const ok = await aoAplicar(campos);
    setAplicando(false);
    if (ok) aoMudar(false);
  }

  return (
    <Janela
      aberta={aberta}
      aoMudar={aoMudar}
      titulo={T.titulo_classificar}
      descricao={rotuloSelecionados(quantidade)}
      rodape={
        <>
          <Botao onClick={() => aoMudar(false)}>{ROTULOS.cancelar}</Botao>
          <Botao variante="primario" disabled={nada || aplicando} onClick={() => void aplicar()}>
            {rotuloAplicarA(quantidade)}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Seletor
          rotulo={TEXTOS_LANCAMENTO.responsavel}
          value={escolha.responsavelId}
          onChange={(e) => setEscolha({ ...escolha, responsavelId: e.target.value })}
          opcoes={opcoes(responsaveis)}
        />
        <Seletor
          rotulo={TEXTOS_LANCAMENTO.tipo}
          value={escolha.tipoId}
          onChange={(e) => setEscolha({ ...escolha, tipoId: e.target.value })}
          opcoes={opcoes(tipos)}
        />
        <Seletor
          rotulo={TEXTOS_LANCAMENTO.status}
          value={escolha.status}
          onChange={(e) => setEscolha({ ...escolha, status: e.target.value })}
          opcoes={opcoes(status, [{ valor: STATUS_NENHUM, rotulo: TEXTOS_LANCAMENTO.sem_status }])}
        />
        <Campo
          rotulo={T.observacao}
          placeholder={T.observacao_dica}
          value={escolha.observacao}
          onChange={(e) => setEscolha({ ...escolha, observacao: e.target.value })}
        />
        {partes > 0 ? <p className="texto-caption text-text-muted">{notaPartesDaDivisao(partes)}</p> : null}
        {nada ? <p className="texto-caption text-text-muted">{T.escolha_ao_menos_um}</p> : null}
      </div>
    </Janela>
  );
}
