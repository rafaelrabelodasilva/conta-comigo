"use client";

import { formatarDinheiro } from "@/domain/dinheiro";
import { formatarParcela } from "@/domain/importacao-fatura";
import {
  TEXTOS_AJUSTE,
  TEXTOS_REVISAR as T,
  rotuloAjusteDoItem,
  rotuloConfirmarItem,
  rotuloMesDoItem,
  rotuloMudarItem,
} from "@/domain/mensagens";
import type { ItemDaFila } from "@/domain/revisar";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";

// Item da fila do Revisar (`review-item`, UX-DR): 64 pt de altura, colunas
// fixas 30 / 1fr / 210 / 84 / 104 para os botões se alinharem em todas as
// linhas. A 1ª coluna fica reservada à caixa do lote (História 3.3) e, por
// ora, vazia. Toque de 44 pt nos botões. Variantes: sugestão, com dúvida e
// sem sugestão. Os Ajustes da mãe aparecem como linhas menores sob o Nome.
//
// ✓ ("Confirmar") só existe se a sugestão completa Responsável e Tipo;
// "Mudar" abre a janela de seletores.

export const COLUNAS_ITEM_REVISAR = "grid-cols-[30px_minmax(0,1fr)_210px_84px_104px]";

export type PropsItemRevisar = {
  item: ItemDaFila;
  /** Mostra o Mês do item (a fila tem mais de um). */
  comMes: boolean;
  /** Uma gravação do item está em curso: os botões ficam desligados. */
  ocupado?: boolean;
  aoConfirmar: (item: ItemDaFila) => void;
  aoMudar: (item: ItemDaFila) => void;
};

export function ItemRevisar({ item, comMes, ocupado = false, aoConfirmar, aoMudar }: PropsItemRevisar) {
  const parcela = formatarParcela(item.parcelaN, item.parcelaTotal);
  const detalhe = [comMes ? rotuloMesDoItem(item.mes) : null, parcela || null, formatarDinheiro(item.valorCentavos)]
    .filter((p): p is string => p !== null)
    .join(" · ");
  const semSugestao = item.variante === "sem_sugestao";
  return (
    <li
      data-variante={item.variante}
      className={cn("grid min-h-16 items-center gap-3 border-b border-border-subtle px-3.5 py-2.5", COLUNAS_ITEM_REVISAR)}
    >
      {/* Reservada à caixa de seleção do lote (3.3). */}
      <span aria-hidden />
      <div className="min-w-0">
        <p className="truncate texto-body-strong">{item.nome}</p>
        <p className="texto-number text-text-muted">{detalhe}</p>
        {item.ajustes.map((a) => (
          <p key={a.id} data-ajuste className="texto-caption text-text-muted">
            <span aria-hidden>{TEXTOS_AJUSTE.marca} </span>
            {rotuloAjusteDoItem(a.valorCentavos)}
          </p>
        ))}
      </div>
      <p className="text-right">
        <span className="block min-h-4 texto-caption text-text-muted">{semSugestao ? "" : T.sugestao}</span>
        <span className="block texto-body-strong">{semSugestao ? T.sem_sugestao : item.sugestao}</span>
        {item.duvida ? <span className="block texto-caption text-text-muted">{item.duvida}</span> : null}
      </p>
      <div className="flex justify-end">
        {item.confirmavel ? (
          <Botao
            variante="primario"
            aria-label={rotuloConfirmarItem(item.nome)}
            title={T.confirmar}
            disabled={ocupado}
            onClick={() => aoConfirmar(item)}
            className="size-11 px-0 text-base"
          >
            <span aria-hidden>✓</span>
          </Botao>
        ) : null}
      </div>
      <Botao
        aria-label={rotuloMudarItem(item.nome)}
        disabled={ocupado}
        onClick={() => aoMudar(item)}
        className="w-full px-1.5"
      >
        {T.mudar}
      </Botao>
    </li>
  );
}
