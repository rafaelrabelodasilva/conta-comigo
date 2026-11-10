"use client";

import { useEffect, useRef } from "react";
import { formatarDinheiro } from "@/domain/dinheiro";
import { TEXTOS_REVISAR as T, rotuloSelecionados } from "@/domain/mensagens";
import { Botao } from "@/ui/Botao";

// Barra de lote (`selection-bar`, História 3.3): presa embaixo, só com 1+
// itens marcados. Fundo `nav`, texto branco, raio `md`, sombra flutuante.
// Mostra "N selecionados · R$ total" (soma líquida, mãe mais Ajustes), "Limpar",
// "Responsável…", "Tipo…" e "Aplicar sugestões" (principal). A contagem é
// `role="status"`: o leitor de tela a anuncia quando muda.
//
// Enquanto existe, publica a altura em `--altura-barra-inferior` (na raiz do
// documento) para o aviso inferior (`Toast`) subir acima dela.

/** A variável CSS com a altura (e a folga) que a barra ocupa embaixo. */
export const VARIAVEL_ALTURA_BARRA = "--altura-barra-inferior";

/** Folga entre a barra e o aviso que sobe acima dela, em px. */
const FOLGA_DO_AVISO = 8;

export type PropsBarraLote = {
  quantidade: number;
  /** A soma líquida dos selecionados. */
  totalCentavos: number;
  /** Um lote está sendo gravado: as ações ficam desligadas. */
  ocupado?: boolean;
  aoLimpar: () => void;
  aoEscolherResponsavel: () => void;
  aoEscolherTipo: () => void;
  aoAplicarSugestoes: () => void;
};

const BOTAO_NA_BARRA = "border-nav-label text-on-dark";

export function BarraLote({
  quantidade,
  totalCentavos,
  ocupado = false,
  aoLimpar,
  aoEscolherResponsavel,
  aoEscolherTipo,
  aoAplicarSugestoes,
}: PropsBarraLote) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const barra = ref.current;
    if (!barra) return;
    const raiz = document.documentElement;
    const publicar = () => raiz.style.setProperty(VARIAVEL_ALTURA_BARRA, `${barra.offsetHeight + FOLGA_DO_AVISO}px`);
    publicar();
    const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publicar);
    observador?.observe(barra);
    return () => {
      observador?.disconnect();
      raiz.style.removeProperty(VARIAVEL_ALTURA_BARRA);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div
        ref={ref}
        role="region"
        aria-label={T.barra_lote}
        className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-md bg-nav px-4 py-2 text-on-dark shadow-flutuante texto-body"
      >
        <p role="status" className="whitespace-nowrap">
          {rotuloSelecionados(quantidade)} · <strong className="texto-body-strong">{formatarDinheiro(totalCentavos)}</strong>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Botao className={BOTAO_NA_BARRA} disabled={ocupado} onClick={aoLimpar}>
            {T.limpar}
          </Botao>
          <Botao className={BOTAO_NA_BARRA} disabled={ocupado} onClick={aoEscolherResponsavel}>
            {T.responsavel_lote}
          </Botao>
          <Botao className={BOTAO_NA_BARRA} disabled={ocupado} onClick={aoEscolherTipo}>
            {T.tipo_lote}
          </Botao>
          <Botao variante="primario" disabled={ocupado} onClick={aoAplicarSugestoes}>
            {T.aplicar_sugestoes}
          </Botao>
        </div>
      </div>
    </div>
  );
}
