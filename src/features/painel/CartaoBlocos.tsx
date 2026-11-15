import { TEXTOS_BLOCO as T } from "@/domain/mensagens";
import { Botao } from "@/ui/Botao";

// Cartão "Blocos" do Painel, na versão da História 4.1: o título, o botão
// "＋ Novo bloco" (que abre o Montador) e, por enquanto, só o nome e a Fórmula
// legível de cada Bloco criado. Os `block-card` com valor, ⋯ e 💬, e o
// Reordenar, são da História 4.2.

export type ItemDoCartaoBlocos = { id: string; nome: string; formula: string };

export function CartaoBlocos({
  itens,
  pronto,
  aoNovo,
}: {
  itens: readonly ItemDoCartaoBlocos[];
  /** Os Blocos já foram lidos (o botão só vale então). */
  pronto: boolean;
  aoNovo: () => void;
}) {
  return (
    <section aria-label={T.titulo_cartao} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="texto-title text-text">{T.titulo_cartao}</h2>
        <Botao tamanho="compacto" variante="primario" disabled={!pronto} onClick={aoNovo}>
          <span aria-hidden>＋</span>
          {T.novo}
        </Botao>
      </div>
      {itens.length === 0 ? (
        pronto ? (
          <p className="texto-body text-text-muted">{T.sem_blocos}</p>
        ) : null
      ) : (
        <ul className="flex flex-col gap-1.5">
          {itens.map((b) => (
            <li key={b.id} className="flex flex-col rounded-md border border-border bg-background px-3 py-2">
              <span className="texto-body-strong text-text">{b.nome}</span>
              <span className="texto-caption text-text-muted">{b.formula}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
