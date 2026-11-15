import { useId, type ComponentProps } from "react";
import { cn } from "./cn";

// Seletor (`form-field` com valor + ▾): `<select>` nativo com o visual de
// `Campo` — rótulo em cima, caixa de 44 px com fundo `background`.

export type OpcaoSeletor = { valor: string; rotulo: string };

export type PropsSeletor = Omit<ComponentProps<"select">, "children"> & {
  rotulo: string;
  /** O rótulo só para leitor de tela (linhas de uma lista, onde o contexto já diz o que é). */
  rotuloOculto?: boolean;
  opcoes: readonly OpcaoSeletor[];
};

export function Seletor({ rotulo, rotuloOculto = false, opcoes, id, className, ...props }: PropsSeletor) {
  const gerado = useId();
  const idCampo = id ?? gerado;

  return (
    <div className="flex flex-col gap-1">
      {rotulo ? (
        <label htmlFor={idCampo} className={cn("texto-label text-text", rotuloOculto && "sr-only")}>
          {rotulo}
        </label>
      ) : null}
      <div className="relative">
        <select
          id={idCampo}
          {...props}
          className={cn(
            "min-h-toque w-full cursor-pointer appearance-none rounded-sm border border-border bg-background pr-9 pl-3 texto-body text-text disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 texto-body text-text-muted"
        >
          ▾
        </span>
      </div>
    </div>
  );
}
