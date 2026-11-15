import { useId, type ComponentProps } from "react";
import { cn } from "./cn";

// Área de texto de várias linhas (`form-field`): o mesmo rótulo, a mesma
// borda e o mesmo erro do `Campo`, com no mínimo 44 px de altura.
export type PropsAreaTexto = ComponentProps<"textarea"> & {
  rotulo: string;
  /** Mensagem de erro do campo; já vem do mapa de mensagens. */
  erro?: string | null;
};

export function AreaTexto({
  rotulo,
  erro,
  id,
  className,
  "aria-describedby": descritoPor,
  "aria-invalid": invalido,
  ...props
}: PropsAreaTexto) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const idErro = `${idCampo}-erro`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={idCampo} className="texto-label text-text">
        {rotulo}
      </label>
      <textarea
        id={idCampo}
        {...props}
        aria-invalid={erro ? true : invalido}
        aria-describedby={[descritoPor, erro ? idErro : null].filter(Boolean).join(" ") || undefined}
        className={cn(
          "min-h-toque w-full resize-y rounded-sm border border-border bg-background px-3 py-2 texto-body text-text placeholder:text-text-muted",
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
