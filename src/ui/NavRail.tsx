"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { cn } from "./cn";
import { ITENS_NAV, destinoDoAtalho, itemAtivo, type IconeNav } from "./navegacao";

// Menu lateral (`nav-rail`): seis itens com ícone de traço (1,8 px, 22 px) e
// rótulo curto. O ativo tem fundo branco a 8%, ícone `accent-line` e rótulo
// branco. No PC, ⌘/Ctrl + 1…6 navega. As regras estão em `navegacao.ts`.

// Traços copiados do mockup `painel.html`.
const TRACOS: Record<IconeNav, ReactNode> = {
  painel: <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />,
  revisar: (
    <>
      <path d="M4 6h16M4 12h10M4 18h7" />
      <path d="M15 17l2 2 4-4" />
    </>
  ),
  receber: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  previsao: <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
  contas: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  config: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
    </>
  ),
};

function Icone({ nome }: { nome: IconeNav }) {
  return (
    <svg
      aria-hidden
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {TRACOS[nome]}
    </svg>
  );
}

export function NavRail({ contadorRevisar = 0 }: { contadorRevisar?: number }) {
  const caminho = usePathname();
  const router = useRouter();
  const ativo = itemAtivo(caminho);

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.defaultPrevented) return;
      const alvo = evento.target instanceof HTMLElement ? evento.target : null;
      const destino = destinoDoAtalho({
        key: evento.key,
        code: evento.code,
        metaKey: evento.metaKey,
        ctrlKey: evento.ctrlKey,
        altKey: evento.altKey,
        shiftKey: evento.shiftKey,
        isComposing: evento.isComposing,
        alvo: alvo && {
          tagName: alvo.tagName,
          type: alvo instanceof HTMLInputElement ? alvo.type : undefined,
          isContentEditable: alvo.isContentEditable,
        },
      });
      if (!destino) return;
      evento.preventDefault();
      router.push(destino);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [router]);

  return (
    <nav
      aria-label="Menu principal"
      className="flex w-rail shrink-0 flex-col items-center gap-1.5 bg-nav pt-3"
    >
      {ITENS_NAV.map((item, i) => {
        const eAtivo = ativo?.rota === item.rota;
        const contador = item.icone === "revisar" && contadorRevisar > 0 ? contadorRevisar : 0;
        return (
          <Link
            key={item.rota}
            href={item.rota}
            aria-current={eAtivo ? "page" : undefined}
            aria-keyshortcuts={`Meta+${i + 1} Control+${i + 1}`}
            title={item.titulo}
            className={cn(
              "relative flex min-h-toque w-14 flex-col items-center justify-center gap-0.75 rounded-md py-1.5 texto-nav-label",
              eAtivo ? "bg-nav-active text-on-dark" : "text-nav-label",
            )}
          >
            <span className={eAtivo ? "text-accent-line" : "text-nav-icon-idle"}>
              <Icone nome={item.icone} />
            </span>
            {item.rotulo}
            {contador > 0 ? (
              <span className="absolute top-0.5 right-2 rounded-full bg-verify px-1.25 texto-nav-label font-bold text-on-verify tabular-nums">
                <span className="sr-only">, </span>
                {contador}
                <span className="sr-only"> para revisar</span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
