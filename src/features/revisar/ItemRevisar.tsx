"use client";

import { formatarDiaMes } from "@/domain/datas";
import { formatarDinheiro } from "@/domain/dinheiro";
import { formatarParcela } from "@/domain/importacao-fatura";
import {
  TEXTOS_AJUSTE,
  TEXTOS_REVISAR as T,
  rotuloAjusteDoItem,
  rotuloConfirmarItem,
  rotuloManterClassificacao,
  rotuloManterPrevisto,
  rotuloMesDoItem,
  rotuloMudarItem,
  rotuloRemoverPrevisto,
  rotuloRepeticao,
  rotuloSelecionar,
} from "@/domain/mensagens";
import type { ItemDaFila } from "@/domain/revisar";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { CaixaLote } from "./CaixaLote";

// Item da fila do Revisar (`review-item`, UX-DR): 64 pt de altura, colunas
// fixas 30 / 1fr / 210 / 84 / 104 para os botões se alinharem em todas as
// linhas. A 1ª coluna leva a caixa do lote (História 3.3, toque de 44 pt); o
// item marcado tem o fundo `selection`. Toque de 44 pt nos botões. Variantes: sugestão, com dúvida e
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
  /** O item está marcado para o lote. */
  marcado: boolean;
  aoMarcar: (item: ItemDaFila) => void;
  aoConfirmar: (item: ItemDaFila) => void;
  aoMudar: (item: ItemDaFila) => void;
  /** "Não veio na fatura": "Remover previsto" (exclui o previsto). */
  aoRemoverPrevisto?: (item: ItemDaFila) => void;
  /** "Não veio na fatura": "Manter" (tira da fila e continua previsto). */
  aoManterPrevisto?: (item: ItemDaFila) => void;
};

export function ItemRevisar({
  item,
  comMes,
  ocupado = false,
  marcado,
  aoMarcar,
  aoConfirmar,
  aoMudar,
  aoRemoverPrevisto,
  aoManterPrevisto,
}: PropsItemRevisar) {
  const parcela = formatarParcela(item.parcelaN, item.parcelaTotal);
  // "Mês · DD/MM · Parcela · Valor · 2 de 3": a data e a posição separam compras iguais da Fatura.
  const detalhe = [
    comMes ? rotuloMesDoItem(item.mes) : null,
    item.data ? formatarDiaMes(item.data) : null,
    parcela || null,
    formatarDinheiro(item.valorCentavos),
    item.repeticao ? rotuloRepeticao(item.repeticao.posicao, item.repeticao.total) : null,
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");
  const semSugestao = item.variante === "sem_sugestao";
  const valorMudou = item.variante === "valor_mudou";
  const naoVeio = item.variante === "nao_veio";
  return (
    <li
      data-variante={item.variante}
      className={cn(
        "grid min-h-16 items-center gap-3 border-b border-border-subtle px-3.5 py-2.5",
        COLUNAS_ITEM_REVISAR,
        marcado && "bg-selection",
      )}
    >
      {/* "Não veio na fatura" não entra no lote: a coluna fica vazia para as outras se alinharem. */}
      {item.selecionavel ? (
        <CaixaLote rotulo={rotuloSelecionar(item.nome)} estado={marcado ? "todos" : "nenhum"} aoMudar={() => aoMarcar(item)} />
      ) : (
        <span aria-hidden />
      )}
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
      {naoVeio ? (
        <>
          <p className="text-right">
            <span className="block min-h-4 texto-caption text-text-muted">{T.previsto}</span>
            <span className="block texto-body-strong">{T.nao_veio}</span>
          </p>
          <div className="col-span-2 flex justify-end gap-2">
            <Botao
              aria-label={rotuloRemoverPrevisto(item.nome)}
              disabled={ocupado}
              onClick={() => aoRemoverPrevisto?.(item)}
              className="flex-1 px-1.5"
            >
              {T.remover_previsto}
            </Botao>
            <Botao
              variante="primario"
              aria-label={rotuloManterPrevisto(item.nome)}
              disabled={ocupado}
              onClick={() => aoManterPrevisto?.(item)}
              className="w-20 px-1.5"
            >
              {T.manter}
            </Botao>
          </div>
        </>
      ) : (
        <>
          <p className="text-right">
            <span className="block min-h-4 texto-caption text-text-muted">
              {valorMudou ? T.valor_mudou : semSugestao ? "" : T.sugestao}
            </span>
            <span className="block texto-body-strong">
              {valorMudou ? item.texto : semSugestao ? T.sem_sugestao : item.sugestao}
            </span>
            {valorMudou && item.sugestao ? <span className="block texto-caption text-text-muted">{item.sugestao}</span> : null}
            {item.duvida ? <span className="block texto-caption text-text-muted">{item.duvida}</span> : null}
          </p>
          <div className="flex justify-end">
            {item.confirmavel ? (
              <Botao
                variante="primario"
                aria-label={valorMudou ? rotuloManterClassificacao(item.nome) : rotuloConfirmarItem(item.nome)}
                title={valorMudou ? T.manter_classificacao : T.confirmar}
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
        </>
      )}
    </li>
  );
}
