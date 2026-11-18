"use client";

import { useState, type FormEvent } from "react";
import { ehData, mesDaData } from "@/domain/ciclo";
import { TEXTOS_DIVIDA as T, mensagem, rotuloLancamentos } from "@/domain/mensagens";
import { Botao } from "@/ui/Botao";
import { AreaTexto } from "@/ui/AreaTexto";
import { Campo } from "@/ui/Campo";
import { Janela } from "@/ui/Janela";

// "Programar dívida" (História 6.6, FR-27, UX-DR19): a janela pequena da data combinada (obrigatória) e de
// uma observação opcional, para a Seleção, o ⋯ da grade ou o campo do painel do Lançamento. A regra (quais
// linhas valem, a data, o que fica de fora) é do núcleo (`planejarProgramacao`); a gravação é de quem abre
// (`aoProgramar`): devolve `{ ok: false, texto }` e a janela fica aberta com o erro, ou `{ ok: true }` e ela
// fecha. Sem conexão, "Programar" fica desativado (AD-3). Aberta sobre uma Dívida que já existe (Editar),
// abre com a data e a observação dela.

export type PropsJanelaProgramarDivida = {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  /** Quantos lançamentos a janela programa (a Seleção, ou 1). */
  quantidade: number;
  /** A data que a janela abre (`AAAA-MM-DD`, de uma Dívida que já existe); vazia numa Dívida nova. */
  dataInicial: string;
  observacaoInicial: string;
  /** Hoje (`AAAA-MM-DD`): diz quando a data já chegou. */
  hoje: string;
  online: boolean;
  aoProgramar: (data: string, observacao: string) => Promise<{ ok: true } | { ok: false; texto: string }>;
};

export function JanelaProgramarDivida({
  aberta,
  aoMudar,
  quantidade,
  dataInicial,
  observacaoInicial,
  hoje,
  online,
  aoProgramar,
}: PropsJanelaProgramarDivida) {
  const [data, setData] = useState(dataInicial);
  const [observacao, setObservacao] = useState(observacaoInicial);
  const [erroDaData, setErroDaData] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  // A data já chegou (no mês dela ou antes): a Dívida entra na cobrança agora.
  const jaChegou = ehData(data) && ehData(hoje) && mesDaData(data) <= mesDaData(hoje);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (gravando || !online) return;
    if (data.trim() === "") {
      setErroDaData(mensagem("divida.data_vazia"));
      return;
    }
    setErroDaData(null);
    setFalha(null);
    setGravando(true);
    const r = await aoProgramar(data, observacao);
    setGravando(false);
    if (!r.ok) {
      setFalha(r.texto);
      return;
    }
    aoMudar(false);
  }

  const formulario = "formulario-programar-divida";
  return (
    <Janela
      aberta={aberta}
      aoMudar={(a) => {
        if (!gravando) aoMudar(a);
      }}
      titulo={T.programar}
      descricao={`${rotuloLancamentos(quantidade)} · ${T.descricao}`}
      rodape={
        <>
          <Botao onClick={() => aoMudar(false)} disabled={gravando}>
            {T.cancelar}
          </Botao>
          <Botao type="submit" form={formulario} variante="primario" disabled={gravando || !online}>
            {gravando ? T.confirmando : T.confirmar}
          </Botao>
        </>
      }
    >
      <form id={formulario} onSubmit={enviar} noValidate className="flex flex-col gap-3">
        <Campo
          rotulo={T.data}
          type="date"
          className="texto-number"
          value={data}
          erro={erroDaData}
          onChange={(e) => {
            setData(e.target.value);
            setErroDaData(null);
            setFalha(null);
          }}
        />
        {jaChegou ? <p className="texto-caption text-text-muted">{T.data_ja_chegou}</p> : null}
        <AreaTexto
          rotulo={T.observacao}
          value={observacao}
          onChange={(e) => {
            setObservacao(e.target.value);
            setFalha(null);
          }}
          rows={2}
          maxLength={500}
        />
        {falha ? (
          <p role="alert" className="texto-body text-danger-fg">
            {falha}
          </p>
        ) : null}
        {!online ? <p className="texto-body text-text-muted">{mensagem("conexao.sem_conexao")}</p> : null}
      </form>
    </Janela>
  );
}
