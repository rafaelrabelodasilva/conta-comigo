import { cn } from "./cn";

// Interruptor (`role="switch"`) com o rótulo ao lado: a linha toda tem 44 pt e o
// leitor de tela lê só o rótulo do botão. Usado no Montador de Bloco e na janela
// "Gerar mensagem" ("Incluir previstos").

export function Interruptor({
  rotulo,
  nomeAcessivel,
  ligado,
  aoMudar,
}: {
  rotulo: string;
  /** O nome falado quando o rótulo sozinho não basta (uma lista de interruptores iguais: "Usar em Recebimentos: Lucas"). */
  nomeAcessivel?: string;
  ligado: boolean;
  aoMudar: (ligado: boolean) => void;
}) {
  return (
    <label className="flex min-h-toque cursor-pointer items-center gap-2 texto-body text-text">
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={nomeAcessivel ?? rotulo}
        onClick={() => aoMudar(!ligado)}
        className={cn(
          "area-toque relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border transition-colors",
          ligado ? "border-accent bg-accent" : "border-border bg-background",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-4 rounded-full transition-transform",
            ligado ? "translate-x-5 bg-accent-foreground" : "translate-x-1 bg-text-muted",
          )}
        />
      </button>
      <span aria-hidden>{rotulo}</span>
    </label>
  );
}
