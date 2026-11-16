"use client";

import { useMemo, useState } from "react";
import { mesPadraoDoEncerramento, previaDoEncerramento, type ContaSalva } from "@/domain/alterar-conta";
import { formatarMes } from "@/domain/datas";
import {
  TEXTOS_CONTAS as T,
  mensagem,
  rotuloEncerrarExclui,
  rotuloFicamComoEstao,
} from "@/domain/mensagens";
import type { LeituraDaConta } from "@/data/contas-repo";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { Janela } from "@/ui/Janela";
import type { ResultadoDoFormulario } from "./FormularioConta";

// Janela "Encerrar conta" (História 5.4, FR-18): "A partir de qual mês?". A
// Conta vale até o mês anterior ao escolhido; os Lançamentos dele em diante que
// ainda podem ser recriados saem (exclusão lógica) e os Meses anteriores não
// mudam. A prévia ("N lançamentos serão excluídos", "Ficam como estão: …") vem do
// núcleo (`previaDoEncerramento`), com a leitura dos Lançamentos que a tela fez
// ao abrir; quem decide o que é válido é o núcleo (`validarEncerramento`).
//
// - Sem conexão ou antes da leitura chegar, "Encerrar" fica desativado.
// - Uma recusa do banco deixa a janela aberta com a mensagem; o toque repetido é
//   seguro (a RPC confere a versão e não grava duas vezes).

export function JanelaEncerrarConta({
  conta,
  mesAtual,
  leitura,
  erroDaLeitura = null,
  online,
  aoMudar,
  aoEncerrar,
}: {
  conta: ContaSalva;
  mesAtual: string;
  /** A leitura dos Lançamentos da Conta: `null` enquanto não chegou. */
  leitura: LeituraDaConta | null;
  /** A leitura falhou: a mensagem (a janela não grava sem ela). */
  erroDaLeitura?: string | null;
  online: boolean;
  aoMudar: (aberta: boolean) => void;
  aoEncerrar: (mes: string) => Promise<ResultadoDoFormulario>;
}) {
  const [mes, setMes] = useState(() => mesPadraoDoEncerramento(mesAtual));
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  const previa = useMemo(
    () =>
      leitura === null
        ? null
        : previaDoEncerramento(conta, leitura.serie, mes, {
            mesAtual,
            statusQueContam: leitura.statusQueContam,
            existentes: leitura.existentes,
            comPagamento: leitura.comPagamento,
          }),
    [conta, leitura, mes, mesAtual],
  );
  const recusa = previa !== null && "codigo" in previa ? mensagem(previa.codigo) : null;
  const pronto = previa !== null && !("codigo" in previa);

  async function enviar() {
    if (salvando || !online || !pronto) return;
    setSalvando(true);
    setFalha(null);
    const r = await aoEncerrar(mes);
    if (!r.ok) {
      setFalha(mensagem(r.codigo));
      setSalvando(false);
      return;
    }
    aoMudar(false);
  }

  return (
    <Janela
      aberta
      aoMudar={(a) => {
        if (!salvando) aoMudar(a);
      }}
      titulo={T.titulo_encerrar}
      descricao={T.descricao_encerrar}
      rodape={
        <>
          <Botao onClick={() => aoMudar(false)} disabled={salvando}>
            {T.cancelar}
          </Botao>
          <Botao variante="primario" onClick={() => void enviar()} disabled={salvando || !online || !pronto}>
            {salvando ? T.salvando : T.encerrar}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo
          rotulo={T.encerrar_a_partir}
          type="month"
          value={mes}
          onChange={(e) => {
            setFalha(null);
            setMes(e.target.value);
          }}
          placeholder="AAAA-MM"
          erro={recusa}
        />
        <div aria-live="polite" className="flex flex-col gap-1 texto-body text-text-muted">
          {leitura === null && erroDaLeitura === null ? <p>{T.conferindo}</p> : null}
          {previa !== null && "excluidas" in previa ? (
            <>
              <p>{rotuloEncerrarExclui(previa.excluidas, formatarMes(mes))}</p>
              {previa.mantidas.length > 0 ? (
                <p>
                  {rotuloFicamComoEstao(previa.mantidas.map((p) => ({ mesFormatado: formatarMes(p.mes), motivo: p.motivo })))}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
        {falha ?? erroDaLeitura ? (
          <p role="alert" className="texto-body text-danger-fg">
            {falha ?? erroDaLeitura}
          </p>
        ) : null}
        {!online ? <p className="texto-body text-text-muted">{T.sem_internet}</p> : null}
      </div>
    </Janela>
  );
}
