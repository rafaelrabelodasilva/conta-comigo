"use client";

import type { CartaoDeCobranca as Cartao, SituacaoDeCobranca } from "@/domain/recebimentos";
import { formatarDinheiro } from "@/domain/dinheiro";
import {
  ROTULO_ATRASADO,
  TEXTOS_RECEBIMENTOS as T,
  rotuloAtrasadoDesde,
  rotuloCobrarPendencias,
  rotuloMesesEmAberto,
  rotuloVerEmAberto,
} from "@/domain/mensagens";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { classesPessoa } from "@/ui/cores-pessoa";
import { SeloStatus, type VarianteDoSelo } from "@/ui/SeloStatus";

// Cartão de Recebimentos (UX-DR22, História 6.5, FR-26): o nome (ou etiqueta) do Bloco de cobrança, o selo
// de situação ("Em dia", "Não pago", "Atrasado"), o Saldo pendente em `block-value`, a linha de detalhe com os
// Meses em aberto e os botões "Ver" e "Cobrar pendências". Só mostra o que o núcleo calculou
// (`montarCartoesDeCobranca`): o texto da situação é sempre uma palavra, nunca só uma cor (NFR8).
//
// "Ver" abre a lista dos Lançamentos em aberto (quem monta a tela decide onde); o botão é um interruptor
// (`aria-expanded`) e some a lista ao tocar de novo. "Cobrar pendências" é da História 6.7 (a forma 3 da
// mensagem): aqui é só a casca, desativada, com a dica "Disponível em breve".

const SELOS: Record<SituacaoDeCobranca, { variante: VarianteDoSelo; texto: string }> = {
  em_dia: { variante: "pago", texto: T.selo_em_dia },
  nao_pago: { variante: "nao_pago", texto: T.selo_nao_pago },
  atrasado: { variante: "atrasado", texto: ROTULO_ATRASADO },
};

export function CartaoDeCobranca({
  cartao,
  corPessoa,
  aberto,
  aoVer,
}: {
  cartao: Cartao;
  /** A cor (1..8) do Responsável de um Bloco de uma pessoa só; senão `null`. */
  corPessoa: number | null;
  /** A lista deste Bloco está aberta. */
  aberto: boolean;
  aoVer: () => void;
}) {
  const saldo = cartao.saldoCentavos === null ? T.sem_valor : formatarDinheiro(cartao.saldoCentavos);
  const selo = SELOS[cartao.situacao];
  const desde = cartao.situacao === "atrasado" && cartao.atrasadoDesde !== null ? rotuloAtrasadoDesde(cartao.atrasadoDesde) : null;
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-md border bg-background p-3",
        aberto ? "border-accent-line ring-1 ring-accent-line" : "border-border",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {corPessoa === null ? null : (
          <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", classesPessoa(corPessoa).fundo)} />
        )}
        <h3 className="min-w-0 flex-1 truncate texto-body-strong">{cartao.nome}</h3>
        <SeloStatus variante={selo.variante}>
          {selo.texto}
        </SeloStatus>
      </div>
      <div className="flex flex-col">
        <p className="texto-caption text-text-muted">{T.saldo_pendente}</p>
        <p className="texto-block-value tabular-nums">{saldo}</p>
      </div>
      <p className="texto-caption text-text-muted">
        {rotuloMesesEmAberto(cartao.mesesEmAberto)}
        {desde === null ? null : ` · ${desde}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Botao aria-label={rotuloVerEmAberto(cartao.nome)} aria-expanded={aberto} onClick={aoVer}>
          {T.ver}
        </Botao>
        <Botao aria-label={rotuloCobrarPendencias(cartao.nome)} disabled title={T.cobrar_em_breve}>
          {T.cobrar}
        </Botao>
      </div>
    </li>
  );
}
