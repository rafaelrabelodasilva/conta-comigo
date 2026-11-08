"use client";

import { Popover } from "radix-ui";
import { useId, useState } from "react";
import { rotuloDaPilula, type ColunaFiltro, type FiltrosGrade, type OpcaoFiltro, type ValorFiltro } from "@/domain/filtros-grade";
import { COLUNAS_FILTRO, TEXTOS_FILTROS, rotuloValorFiltro, tituloPopoverFiltro } from "@/domain/mensagens";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";

// Pílula de uma coluna da barra de filtros (`filter-chip`) com o popover de
// várias escolhas (`popover`, Radix como o `SeletorMes`). Inativa:
// "Responsável ▾"; ativa (`selection`/`accent-line`): "Responsável: Casal,
// Rangel ▾". O popover tem o título "Responsável (pode marcar vários)", uma
// linha de 44 pt por valor (caixa, etiqueta e contagem) e o rodapé "Limpar"
// (zera a coluna e fecha) e "Aplicar" (aplica o rascunho e fecha). Fechar de
// outro jeito (Esc, toque fora) descarta o rascunho.

/** Classes da pílula da barra (`filter-chip`), ativa ou não. */
export function classesPilula(ativa: boolean): string {
  return cn(
    "inline-flex min-h-toque shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 texto-label text-text",
    ativa ? "border-accent-line bg-selection" : "border-border bg-surface",
  );
}

/** Popover da barra (`popover`, DESIGN.md). */
export const CLASSES_POPOVER = "z-50 rounded-lg border border-border bg-surface p-2 text-text shadow-popover";

export type PropsPopoverFiltro = {
  coluna: ColunaFiltro;
  filtros: FiltrosGrade;
  /** A lista do popover (`valoresDaColuna`). */
  opcoes: readonly OpcaoFiltro[];
  aoAplicar: (valores: ValorFiltro[]) => void;
};

const chave = (v: ValorFiltro) => v ?? "∅";

export function PopoverFiltro({ coluna, filtros, opcoes, aoAplicar }: PropsPopoverFiltro) {
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<readonly ValorFiltro[]>([]);
  const idTitulo = useId();
  const escolhidos = filtros.colunas[coluna];
  const titulo = tituloPopoverFiltro(COLUNAS_FILTRO[coluna]);

  function mudar(abrir: boolean) {
    // Abre com o que está aplicado; fechar sem "Aplicar" descarta o rascunho.
    if (abrir) setRascunho(escolhidos);
    setAberto(abrir);
  }

  function alternar(valor: ValorFiltro) {
    setRascunho((r) => {
      const marcados = new Set(r.includes(valor) ? r.filter((v) => v !== valor) : [...r, valor]);
      // Na ordem da lista.
      return opcoes.map((o) => o.valor).filter((v) => marcados.has(v));
    });
  }

  function aplicar(valores: ValorFiltro[]) {
    aoAplicar(valores);
    setAberto(false);
  }

  return (
    <Popover.Root open={aberto} onOpenChange={mudar}>
      <Popover.Trigger className={classesPilula(escolhidos.length > 0)}>
        {/* Texto longo fica cortado; o nome acessível continua inteiro. */}
        <span className="max-w-56 truncate">{rotuloDaPilula(coluna, filtros, opcoes)}</span>
        <span aria-hidden>▾</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          aria-labelledby={idTitulo}
          className={cn(CLASSES_POPOVER, "flex max-h-[70dvh] w-72 flex-col")}
        >
          <p id={idTitulo} className="px-3 py-2 texto-label text-text-muted">
            {titulo}
          </p>
          {opcoes.length === 0 ? (
            <p className="px-3 py-2 texto-body text-text-muted">{TEXTOS_FILTROS.sem_opcoes}</p>
          ) : null}
          <ul className="flex flex-col overflow-y-auto">
            {opcoes.map((o) => (
              <li key={chave(o.valor)}>
                <label className="flex min-h-toque cursor-pointer items-center gap-3 rounded-sm px-3 texto-body">
                  <input
                    type="checkbox"
                    aria-label={rotuloValorFiltro(o.rotulo, o.contagem)}
                    checked={rascunho.includes(o.valor)}
                    onChange={() => alternar(o.valor)}
                    className="size-4.5 shrink-0 cursor-pointer accent-accent"
                  />
                  <span className="flex-1">{o.rotulo}</span>
                  <span aria-hidden className="texto-number text-text-muted">
                    {o.contagem}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex justify-end gap-2 border-t border-border-subtle px-1 pt-2">
            <Botao tamanho="compacto" onClick={() => aplicar([])}>
              {TEXTOS_FILTROS.limpar}
            </Botao>
            <Botao tamanho="compacto" variante="primario" onClick={() => aplicar([...rascunho])}>
              {TEXTOS_FILTROS.aplicar}
            </Botao>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
