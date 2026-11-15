"use client";

import { formatarDinheiro } from "@/domain/dinheiro";
import type { EtiquetaDaConta, LinhaDaLista } from "@/domain/lista-contas";
import { TEXTOS_CONTAS as T, rotuloAcoesDaConta } from "@/domain/mensagens";
import { cn } from "@/ui/cn";
import { classesPessoa } from "@/ui/cores-pessoa";
import { MenuAcoes, type ItemMenuAcoes } from "@/ui/MenuAcoes";

// A tabela das Contas manuais (História 5.2, UX-DR24): Conta (com a descrição
// da repetição), Valor por mês, Responsável ou Divisão (etiquetas), Tipo,
// Situação e o ⋯. Só desenha as linhas que o núcleo (`lista-contas.ts`)
// montou. É uma tabela por `role` (as linhas são grades CSS, e o Safari perde
// a semântica de `<table>` quando o `display` muda). A linha não é um botão: o
// toque nela não faz nada nesta história; as ações estão no ⋯ (44 pt).
//
// Layout (834 pt em pé e deitado): sem rolagem lateral. As seis colunas
// dividem a largura, o texto da Conta quebra linha e as etiquetas quebram
// para baixo. O cabeçalho fica fixo no topo enquanto a lista rola.

const COLUNAS = "grid-cols-[minmax(0,2.2fr)_minmax(6rem,1fr)_minmax(0,1.6fr)_minmax(0,1fr)_5.5rem_2.75rem]";

function Etiqueta({ e }: { e: EtiquetaDaConta }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 texto-label",
        e.cor === null ? "bg-border-subtle text-text-muted" : classesPessoa(e.cor).etiqueta,
      )}
    >
      {e.texto}
    </span>
  );
}

function LinhaDaTabela({ linha, itens }: { linha: LinhaDaLista; itens: readonly ItemMenuAcoes[] }) {
  return (
    <div role="row" className={cn("grid min-h-toque items-center gap-3 border-b border-border-subtle px-3.5 py-2 last:border-b-0", COLUNAS)}>
      <div role="cell" className="min-w-0">
        <p className="break-words texto-body-strong">{linha.nome}</p>
        <p className="break-words texto-caption text-text-muted">
          <span>{linha.descricao}</span>
          {linha.divisao === null ? null : <span> · {linha.divisao}</span>}
        </p>
      </div>
      <div role="cell" className="text-right">
        <p className="texto-number">{formatarDinheiro(linha.valorCentavos)}</p>
        {linha.legendaDoValor === null ? null : <p className="texto-caption text-text-muted">{linha.legendaDoValor}</p>}
      </div>
      <div role="cell" className="flex min-w-0 flex-wrap items-center gap-1">
        {linha.etiquetas.length === 0 ? (
          <span className="texto-body text-text-muted">{T.sem_valor}</span>
        ) : (
          linha.etiquetas.map((e, i) => <Etiqueta key={`${i}-${e.texto}`} e={e} />)
        )}
      </div>
      <div role="cell" className={cn("min-w-0 break-words texto-body", linha.tipo.removido && "text-text-muted")}>
        {linha.tipo.texto}
      </div>
      <div role="cell">
        <span
          className={cn(
            "rounded-full px-2 texto-caption",
            linha.situacao === "ativa" ? "bg-status-paid-bg text-status-paid-fg" : "bg-border-subtle text-text-muted",
          )}
        >
          {linha.rotuloDaSituacao}
        </span>
      </div>
      <div role="cell" className="flex justify-end">
        <MenuAcoes rotulo={rotuloAcoesDaConta(linha.nome)} itens={itens} />
      </div>
    </div>
  );
}

export function ListaContas({
  linhas,
  itensDaLinha,
}: {
  linhas: readonly LinhaDaLista[];
  /** Os itens do ⋯ de cada linha (a tela decide o que cada ação faz). */
  itensDaLinha: (linha: LinhaDaLista) => readonly ItemMenuAcoes[];
}) {
  return (
    <div role="table" aria-label={T.lista} className="rounded-lg border border-border bg-surface">
      <div role="rowgroup" className="sticky top-0 z-10 rounded-t-lg bg-surface">
        <div
          role="row"
          className={cn("grid items-end gap-3 border-b border-border px-3.5 py-2 texto-label text-text-muted", COLUNAS)}
        >
          <div role="columnheader">{T.coluna_conta}</div>
          <div role="columnheader" className="text-right">
            {T.coluna_valor}
          </div>
          <div role="columnheader">{T.coluna_responsavel}</div>
          <div role="columnheader">{T.coluna_tipo}</div>
          <div role="columnheader">{T.coluna_situacao}</div>
          <div role="columnheader" className="sr-only">
            {T.coluna_acoes}
          </div>
        </div>
      </div>
      <div role="rowgroup">
        {linhas.map((l) => (
          <LinhaDaTabela key={l.id} linha={l} itens={itensDaLinha(l)} />
        ))}
      </div>
    </div>
  );
}
