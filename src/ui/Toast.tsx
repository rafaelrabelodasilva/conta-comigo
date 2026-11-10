"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ROTULOS } from "@/domain/mensagens";
import { cn } from "./cn";
import {
  DURACAO_TOAST_MS,
  ESTADO_TOAST_INICIAL,
  desfazerToast,
  fecharToast,
  mostrarToast,
  type EstadoToast,
  type NovoToast,
} from "./toast-estado";

// Aviso inferior (`toast`): faixa escura de raio md, centralizada embaixo, 6 s na tela,
// um substitui o outro, "Desfazer" opcional. As regras estão em `toast-estado.ts`.
// Sobe acima da barra de lote enquanto ela existe: a barra publica a altura em
// `--altura-barra-inferior` (sem barra, vale 0).

type ApiToast = {
  mostrar: (novo: NovoToast) => void;
  fechar: () => void;
};

const ContextoToast = createContext<ApiToast | null>(null);

export function useToast(): ApiToast {
  const api = useContext(ContextoToast);
  if (!api) throw new Error("useToast precisa de um <ToastProvider> acima.");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoToast>(ESTADO_TOAST_INICIAL);
  // A ref é a fonte da verdade para as ações: dois toques rápidos em
  // "Desfazer" veem o mesmo estado e a ação roda uma vez só.
  const ref = useRef(estado);

  const aplicar = useCallback((novo: EstadoToast) => {
    ref.current = novo;
    setEstado(novo);
  }, []);

  const api = useMemo<ApiToast>(
    () => ({
      mostrar: (novo) => aplicar(mostrarToast(ref.current, novo)),
      fechar: () => {
        const id = ref.current.atual?.id;
        if (id !== undefined) aplicar(fecharToast(ref.current, id));
      },
    }),
    [aplicar],
  );

  const atual = estado.atual;

  // Cada aviso novo (id novo) recomeça os 6 s.
  useEffect(() => {
    if (!atual) return;
    const id = atual.id;
    const temporizador = setTimeout(
      () => aplicar(fecharToast(ref.current, id)),
      DURACAO_TOAST_MS,
    );
    return () => clearTimeout(temporizador);
  }, [atual, aplicar]);

  const desfazer = (id: number) => {
    const resultado = desfazerToast(ref.current, id);
    aplicar(resultado.estado);
    resultado.acao?.();
  };

  return (
    <ContextoToast.Provider value={api}>
      {children}
      {/* A região existe sempre, para o leitor de tela anunciar o texto novo. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(1.5rem+var(--altura-barra-inferior,0px))] z-50 flex justify-center px-4"
      >
        {atual ? (
          <div
            key={atual.id}
            className={cn(
              "pointer-events-auto flex min-h-toque max-w-xl items-center gap-4 rounded-md bg-nav py-1 pl-5 text-on-dark shadow-flutuante texto-body",
              atual.aoDesfazer ? "pr-1" : "pr-5",
            )}
          >
            <span>{atual.texto}</span>
            {atual.aoDesfazer ? (
              <button
                type="button"
                onClick={() => desfazer(atual.id)}
                className="min-h-toque cursor-pointer rounded-md px-4 texto-body-strong text-on-dark underline-offset-2 hover:underline"
              >
                {ROTULOS.desfazer}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ContextoToast.Provider>
  );
}
