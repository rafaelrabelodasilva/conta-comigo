"use client";

import { useRef, useSyncExternalStore, type KeyboardEvent } from "react";
import { TEXTOS_PREVISAO as T } from "@/domain/mensagens";
import { ABAS_DA_PREVISAO, ABA_PADRAO, lerAba, type AbaDaPrevisao } from "@/domain/previsao";
import { cn } from "@/ui/cn";
import { Evolucao } from "./Evolucao";
import { MeuGasto } from "./MeuGasto";
import { ProximosMeses } from "./ProximosMeses";

// Tela Previsão (UX-DR23): as três abas "Próximos meses" (7.1), "Evolução" (7.2) e "Meu gasto por Tipo" (7.3).
//
// A aba escolhida fica guardada POR APARELHO, no `localStorage` (preferência de tela, como o filtro de Contas: não é dado
// do app nem precisa seguir Rafael entre o iPad e o PC, então não há migração em `configuracoes`). Todo acesso ao
// armazenamento é protegido: sem ele (janela privada, dados bloqueados) a tela abre na primeira aba e as abas funcionam
// igual, só que a escolha não sobrevive ao fechar a página.

export const CHAVE_DA_ABA_DA_PREVISAO = "conta-comigo:previsao:aba";

const NOME_DA_ABA: Record<AbaDaPrevisao, string> = {
  proximos_meses: T.aba_proximos_meses,
  evolucao: T.aba_evolucao,
  meu_gasto: T.aba_meu_gasto,
};

// A escolha que o armazenamento recusou (janela privada, dados bloqueados): vale na memória até a página fechar.
let naMemoria: AbaDaPrevisao | null = null;
const ouvintes = new Set<() => void>();

function lerAbaGuardada(): AbaDaPrevisao {
  if (naMemoria !== null) return naMemoria;
  try {
    return lerAba(window.localStorage.getItem(CHAVE_DA_ABA_DA_PREVISAO));
  } catch {
    return ABA_PADRAO;
  }
}

function guardarAba(aba: AbaDaPrevisao) {
  try {
    window.localStorage.setItem(CHAVE_DA_ABA_DA_PREVISAO, aba);
    naMemoria = null;
  } catch {
    naMemoria = aba;
  }
  for (const avisar of ouvintes) avisar();
}

// O servidor não conhece o aparelho: a primeira pintura usa a aba padrão e o React troca para a guardada logo depois
// (`getServerSnapshot`), sem divergir da hidratação. O evento `storage` acompanha outra janela do mesmo aparelho.
function assinar(avisar: () => void): () => void {
  ouvintes.add(avisar);
  window.addEventListener("storage", avisar);
  return () => {
    ouvintes.delete(avisar);
    window.removeEventListener("storage", avisar);
  };
}

export function Previsao() {
  const aba = useSyncExternalStore(assinar, lerAbaGuardada, () => ABA_PADRAO);
  const botoes = useRef<Partial<Record<AbaDaPrevisao, HTMLButtonElement | null>>>({});

  function escolher(nova: AbaDaPrevisao) {
    guardarAba(nova);
  }

  // Setas e Home/End andam entre as abas (padrão de abas do WAI-ARIA); o foco acompanha a aba.
  function aoTeclar(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const ultimo = ABAS_DA_PREVISAO.length - 1;
    const destino =
      e.key === "ArrowRight" ? (i === ultimo ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? ultimo : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? ultimo : null;
    if (destino === null) return;
    e.preventDefault();
    const nova = ABAS_DA_PREVISAO[destino];
    escolher(nova);
    botoes.current[nova]?.focus();
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label={T.abas} className="flex flex-wrap items-center gap-2">
        {ABAS_DA_PREVISAO.map((a, i) => {
          const ligada = a === aba;
          return (
            <button
              key={a}
              ref={(el) => {
                botoes.current[a] = el;
              }}
              type="button"
              role="tab"
              id={`aba-previsao-${a}`}
              aria-selected={ligada}
              aria-controls={`painel-previsao-${a}`}
              tabIndex={ligada ? 0 : -1}
              onClick={() => escolher(a)}
              onKeyDown={(e) => aoTeclar(e, i)}
              className={cn(
                "inline-flex min-h-toque cursor-pointer items-center rounded-full border px-4 texto-body",
                ligada ? "border-accent-line bg-selection text-text texto-body-strong" : "border-border bg-surface text-text-muted",
              )}
            >
              {NOME_DA_ABA[a]}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`painel-previsao-${aba}`} aria-labelledby={`aba-previsao-${aba}`}>
        {aba === "proximos_meses" ? (
          <ProximosMeses />
        ) : aba === "evolucao" ? (
          <Evolucao />
        ) : (
          <MeuGasto />
        )}
      </div>
    </div>
  );
}
