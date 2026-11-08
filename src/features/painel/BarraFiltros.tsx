"use client";

import { Popover } from "radix-ui";
import {
  definirColuna,
  filtrosAtivosEm,
  type ColunaFiltro,
  type FiltrosGrade,
  type OpcaoFiltro,
  type ValorFiltro,
} from "@/domain/filtros-grade";
import { TEXTOS_CONFERENCIA, TEXTOS_FILTROS, rotuloMaisFiltros } from "@/domain/mensagens";
import { cn } from "@/ui/cn";
import { CLASSES_POPOVER, PopoverFiltro, classesPilula } from "./PopoverFiltro";

// Barra de filtros da grade (`filter-bar`, UX-DR9, História 2.6): busca
// (filtra enquanto digita, só no Mês aberto), uma pílula por coluna com o
// popover de várias escolhas, "Verificar" (só com Fatura) e "Limpar
// filtros" à direita. iPad em pé (abaixo de `lg`): Lançado por, Parcela,
// cartão e "Verificar" vão para o popover "Mais", que diz quantos filtros
// ativos guarda; deitado e no PC, tudo numa linha. As regras (quem passa,
// contagens, textos) são do núcleo (`filtros-grade.ts`).

/** As colunas que ficam na barra também no iPad em pé. */
const SEMPRE: readonly ColunaFiltro[] = ["responsavel", "tipo", "status"];
/** As que vão para "Mais" no iPad em pé. */
const NO_MAIS: readonly ColunaFiltro[] = ["lancado_por", "parcela", "cartao"];

export type PropsBarraFiltros = {
  filtros: FiltrosGrade;
  aoMudar: (atualizar: (f: FiltrosGrade) => FiltrosGrade) => void;
  /** A lista de cada coluna (`valoresDaColuna`). */
  opcoes: Readonly<Record<ColunaFiltro, readonly OpcaoFiltro[]>>;
  /** A lista de uma coluna mantendo os valores do rascunho do popover aberto (História 2.7). */
  listar?: (coluna: ColunaFiltro, extras: readonly ValorFiltro[]) => readonly OpcaoFiltro[];
  /** O Mês tem Fatura: mostra "Verificar". */
  comVerificar: boolean;
  /** Mostra "Limpar filtros" (há busca, filtro, "Verificar" ou ordem fora da padrão). */
  mostrarLimpar: boolean;
  aoLimparTudo: () => void;
};

export function BarraFiltros({
  filtros,
  aoMudar,
  opcoes,
  listar,
  comVerificar,
  mostrarLimpar,
  aoLimparTudo,
}: PropsBarraFiltros) {
  const pilula = (coluna: ColunaFiltro) => (
    <PopoverFiltro
      key={coluna}
      coluna={coluna}
      filtros={filtros}
      opcoes={opcoes[coluna]}
      listar={listar ? (extras) => listar(coluna, extras) : undefined}
      aoAplicar={(valores) => aoMudar((f) => definirColuna(f, coluna, valores))}
    />
  );
  const verificar = comVerificar ? (
    <button
      type="button"
      aria-pressed={filtros.verificar}
      onClick={() => aoMudar((f) => ({ ...f, verificar: !f.verificar }))}
      className={classesPilula(filtros.verificar)}
    >
      {TEXTOS_CONFERENCIA.verificar}
      {filtros.verificar ? <span aria-hidden>✕</span> : null}
    </button>
  ) : null;
  const noMais = filtrosAtivosEm(filtros, NO_MAIS, comVerificar);

  return (
    <div role="group" aria-label={TEXTOS_FILTROS.barra} className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:overflow-x-auto lg:px-0.5 lg:py-1">
      <label className="flex min-h-toque min-w-40 flex-1 items-center gap-2 rounded-sm border border-border bg-surface px-2.5 sm:max-w-80 sm:min-w-55 sm:flex-none">
        <span aria-hidden>🔍</span>
        <input
          type="search"
          aria-label={TEXTOS_FILTROS.buscar}
          placeholder={TEXTOS_FILTROS.buscar}
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          value={filtros.busca}
          onChange={(e) => {
            const busca = e.target.value;
            aoMudar((f) => ({ ...f, busca }));
          }}
          className="min-w-0 flex-1 bg-transparent texto-body text-text outline-none placeholder:text-text-muted"
        />
      </label>
      {SEMPRE.map(pilula)}
      {/* Deitado e PC: na própria barra. */}
      <div className="hidden lg:contents">
        {NO_MAIS.map(pilula)}
        {verificar}
      </div>
      {/* iPad em pé: no popover "Mais". */}
      <Popover.Root>
        <Popover.Trigger className={cn(classesPilula(noMais > 0), "lg:hidden")}>
          {rotuloMaisFiltros(noMais)}
          <span aria-hidden>▾</span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            aria-label={TEXTOS_FILTROS.mais}
            className={cn(CLASSES_POPOVER, "flex flex-col items-start gap-2")}
          >
            {NO_MAIS.map(pilula)}
            {verificar}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {mostrarLimpar ? (
        <button
          type="button"
          onClick={aoLimparTudo}
          className="ml-auto inline-flex min-h-toque shrink-0 cursor-pointer items-center rounded-full border border-border bg-surface px-3 texto-label text-text-muted"
        >
          {TEXTOS_FILTROS.limpar_filtros}
        </button>
      ) : null}
    </div>
  );
}
