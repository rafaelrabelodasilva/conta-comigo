import { useId, type ComponentProps } from "react";
import { cn } from "./cn";

// Campo de formulário (`form-field`): rótulo em cima, caixa de 44 px com
// fundo `background`. Com erro, borda e mensagem (12 px) em `danger-fg`.
export type PropsCampo = ComponentProps<"input"> & {
  rotulo: string;
  /** Mensagem de erro do campo; já vem do mapa de mensagens. */
  erro?: string | null;
};

export function Campo({
  rotulo,
  erro,
  id,
  className,
  "aria-describedby": descritoPor,
  "aria-invalid": invalido,
  ...props
}: PropsCampo) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const idErro = `${idCampo}-erro`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={idCampo} className="texto-label text-text">
        {rotulo}
      </label>
      <input
        id={idCampo}
        {...props}
        aria-invalid={erro ? true : invalido}
        aria-describedby={[descritoPor, erro ? idErro : null].filter(Boolean).join(" ") || undefined}
        className={cn(
          "min-h-toque w-full rounded-sm border border-border bg-background px-3 texto-body text-text placeholder:text-text-muted",
          erro && "border-danger-fg",
          className,
        )}
      />
      {erro ? (
        <p id={idErro} className="texto-label font-normal text-danger-fg">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
