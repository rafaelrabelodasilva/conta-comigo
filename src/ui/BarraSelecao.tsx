"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "./cn";

// Barra de seleção (`selection-bar`, Histórias 3.3 e 4.4): presa embaixo, só com
// 1+ itens marcados. Fundo `nav`, texto branco, raio `md`, sombra flutuante.
// Mostra "N selecionados · R$ total" (o total em negrito) e as ações que a
// tela põe dentro (`children`). A base é a mesma do Revisar e do Painel.
//
// Enquanto existe, publica a altura em `--altura-barra-inferior` (na raiz do
// documento) para o aviso inferior (`Toast`) subir acima dela.
//
// A contagem é `role="status"` por padrão (o leitor de tela a anuncia quando
// muda). Uma região que nasce junto com a barra pode não ser anunciada na
// primeira marcação: quem monta a barra só com 1+ itens e quer o anúncio já na
// primeira marcação mantém a própria região no DOM (vazia) e passa
// `regiaoPropria={false}`.

/** A variável CSS com a altura (e a folga) que a barra ocupa embaixo. */
export const VARIAVEL_ALTURA_BARRA = "--altura-barra-inferior";

/** Folga entre a barra e o aviso que sobe acima dela, em px. */
const FOLGA_DO_AVISO = 8;

export type PropsBarraSelecao = {
  /** Nome acessível da região. */
  rotulo: string;
  /** "3 selecionados". */
  contagem: string;
  /** "R$ 209,10" (vai em negrito). */
  total: string;
  /**
   * A contagem é a região `role="status"` (padrão). Com `false`, a tela mantém
   * a própria região, fora da barra.
   */
  regiaoPropria?: boolean;
  /**
   * O painel lateral do Lançamento está aberto: de `lg` para cima a barra deixa
   * a coluna dele livre; abaixo de `lg` ele ocupa 70% da largura e a barra se
   * esconde enquanto ele estiver aberto (a Seleção continua).
   */
  comPainelLateral?: boolean;
  children: ReactNode;
};

export function BarraSelecao({
  rotulo,
  contagem,
  total,
  regiaoPropria = true,
  comPainelLateral = false,
  children,
}: PropsBarraSelecao) {
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
    <div
      data-com-painel-lateral={comPainelLateral || undefined}
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4",
        comPainelLateral && "max-lg:hidden lg:right-painel-lateral",
      )}
    >
      <div
        ref={ref}
        role="region"
        aria-label={rotulo}
        className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-md bg-nav px-4 py-2 text-on-dark shadow-flutuante texto-body"
      >
        <p role={regiaoPropria ? "status" : undefined} className="whitespace-nowrap">
          {contagem} · <strong className="texto-body-strong">{total}</strong>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>
      </div>
    </div>
  );
}

/** Botão secundário legível sobre o fundo escuro da barra. */
export const BOTAO_NA_BARRA = "border-nav-label text-on-dark";
