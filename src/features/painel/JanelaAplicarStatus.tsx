"use client";

import { useId, useState } from "react";
import {
  ROTULOS,
  TEXTOS_PAGAMENTO as T,
  mensagem,
  mensagemDoPagamento,
  rotuloForaDoPagamento,
  rotuloTotalAReceber,
} from "@/domain/mensagens";
import {
  campoDoErroDoPagamento,
  planejarPagamento,
  textoDoValorRecebido,
  type PedidoDePagamento,
  type ProjecaoDoPagamento,
} from "@/domain/pagamento";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { Campo } from "@/ui/Campo";
import { Janela } from "@/ui/Janela";

// Janela "Aplicar status" (História 6.1, FR-25, UX-DR18, mockup `aplicar-status.html`):
// a lista dos Status (os ativos). Se o escolhido conta como pago, aparecem a Data (padrão:
// hoje, em America/Sao_Paulo; nunca depois de hoje) e o Valor recebido (padrão: o total que
// a Seleção quita); o núcleo (`planejarPagamento`) valida e monta o pedido da RPC, e a
// janela só mostra o erro no campo dele. Se não conta como pago, data e valor somem e só o
// Status muda (sem Pagamento). O Valor recebido maior que o total não é aceito ("O valor
// recebido não pode passar de R$ X"); o menor é da História 6.2.
//
// Quem abre a janela grava (`aoAplicar`) e a fecha quando dá certo; se falha, ela fica com
// o texto do erro e a Seleção também. O `id` do Pagamento nasce uma vez por abertura da
// janela: repetir o toque (resposta perdida) não grava de novo (a RPC é idempotente nele).
// Sem conexão a ação fica desativada e nada é tentado (AD-3). A janela serve às barras de
// Seleção do Painel e, na História 6.5, à de Recebimentos: ela só recebe a projeção.

/** Um Status da lista. */
export type OpcaoDeStatus = { id: string; nome: string; contaComoPago: boolean };

/** O que a janela pede a quem grava. */
export type EscolhaAplicada =
  | { tipo: "pagamento"; pedido: PedidoDePagamento; quantidade: number }
  | { tipo: "status"; statusId: string };

export type ResultadoAplicar = { ok: true } | { ok: false; texto: string };

export type PropsJanelaAplicarStatus = {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  /** "3 selecionados · R$ 209,10". */
  descricao: string;
  /** Os Status ativos, na ordem da lista de escolha. */
  status: readonly OpcaoDeStatus[];
  /** O que o Pagamento quita; `null` enquanto os itens de Pagamento ainda carregam. */
  projecao: ProjecaoDoPagamento | null;
  /** "Hoje" em America/Sao_Paulo (`AAAA-MM-DD`): a tela lê o relógio. */
  hoje: string;
  online: boolean;
  aoAplicar: (escolha: EscolhaAplicada) => Promise<ResultadoAplicar>;
};

export function JanelaAplicarStatus({
  aberta,
  aoMudar,
  descricao,
  status,
  projecao,
  hoje,
  online,
  aoAplicar,
}: PropsJanelaAplicarStatus) {
  const idGrupo = useId();
  // Uma vez por abertura: a janela só existe enquanto está aberta (quem a monta a desmonta ao fechar).
  const [idDoPagamento] = useState(() => crypto.randomUUID());
  const [statusId, setStatusId] = useState("");
  const [data, setData] = useState(hoje);
  // `null`: Rafael ainda não mexeu, vale o total (que acompanha o Realtime).
  const [valorTexto, setValorTexto] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  const escolhido = status.find((s) => s.id === statusId) ?? null;
  const pago = escolhido?.contaComoPago === true;
  const total = projecao?.totalCentavos ?? 0;
  const valor = valorTexto ?? textoDoValorRecebido(total);
  const plano =
    pago && projecao !== null
      ? planejarPagamento({
          id: idDoPagamento,
          statusId,
          statusPagos: new Set(status.filter((s) => s.contaComoPago).map((s) => s.id)),
          data,
          valorTexto: valor,
          hoje,
          projecao,
        })
      : null;
  const erro = plano !== null && !plano.ok ? plano.erro : null;
  const campoDoErro = erro === null ? null : campoDoErroDoPagamento(erro.codigo);
  const semNadaAReceber = pago && projecao !== null && projecao.entram.length === 0;
  const foraTexto = pago && projecao !== null ? rotuloForaDoPagamento(projecao.fora.quantidade, projecao.fora.porMotivo) : "";
  const carregando = pago && projecao === null;
  const podeAplicar = online && !aplicando && escolhido !== null && (pago ? plano?.ok === true : true);

  async function aplicar() {
    if (!podeAplicar || escolhido === null) return;
    setAplicando(true);
    setFalha(null);
    const r = await aoAplicar(
      pago && plano?.ok === true
        ? { tipo: "pagamento", pedido: plano.valor.pedido, quantidade: plano.valor.quantidade }
        : { tipo: "status", statusId: escolhido.id },
    );
    setAplicando(false);
    if (r.ok) aoMudar(false);
    else setFalha(r.texto);
  }

  return (
    <Janela
      aberta={aberta}
      aoMudar={aoMudar}
      titulo={T.titulo}
      descricao={descricao}
      rodape={
        <>
          <Botao onClick={() => aoMudar(false)}>{ROTULOS.cancelar}</Botao>
          <Botao variante="primario" disabled={!podeAplicar} onClick={() => void aplicar()}>
            {T.aplicar}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label={T.lista_de_status} className="flex flex-wrap gap-2">
          {status.map((s) => (
            <label
              key={s.id}
              className={cn(
                "flex min-h-toque cursor-pointer items-center gap-2 rounded-sm border px-3 texto-body",
                s.id === statusId ? "border-accent bg-selection" : "border-border",
              )}
            >
              <input
                type="radio"
                name={idGrupo}
                value={s.id}
                checked={s.id === statusId}
                onChange={() => {
                  setStatusId(s.id);
                  setFalha(null);
                }}
                className="size-4.5 shrink-0 cursor-pointer accent-accent"
              />
              <span>{s.nome}</span>
            </label>
          ))}
        </div>

        {escolhido === null ? <p className="texto-caption text-text-muted">{T.escolha_o_status}</p> : null}
        {escolhido !== null && !pago ? <p className="texto-body text-text-muted">{T.so_o_status_muda}</p> : null}

        {pago ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo
                rotulo={T.data}
                type="date"
                value={data}
                max={hoje}
                onChange={(e) => setData(e.target.value)}
                erro={campoDoErro === "data" && erro ? mensagemDoPagamento(erro) : null}
              />
              <Campo
                rotulo={T.valor}
                inputMode="decimal"
                autoComplete="off"
                value={valor}
                onChange={(e) => setValorTexto(e.target.value)}
                erro={campoDoErro === "valor" && erro ? mensagemDoPagamento(erro) : null}
              />
            </div>
            {projecao !== null && !semNadaAReceber ? (
              <p className="texto-body text-text-muted">{rotuloTotalAReceber(total)}</p>
            ) : null}
            {foraTexto !== "" ? <p className="texto-caption text-text-muted">{foraTexto}</p> : null}
            {semNadaAReceber ? <p className="texto-body text-danger-fg">{T.nada_a_receber}</p> : null}
            {carregando ? <p className="texto-caption text-text-muted">{T.carregando}</p> : null}
            {campoDoErro === "geral" && erro && !semNadaAReceber ? (
              <p className="texto-body text-danger-fg">{mensagemDoPagamento(erro)}</p>
            ) : null}
          </div>
        ) : null}

        {!online ? <p className="texto-body text-text-muted">{mensagem("conexao.sem_conexao")}</p> : null}
        {falha !== null ? (
          <p role="alert" className="texto-body text-danger-fg">
            {falha}
          </p>
        ) : null}
      </div>
    </Janela>
  );
}
