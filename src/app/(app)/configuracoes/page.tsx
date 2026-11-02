import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROTULOS } from "@/domain/mensagens";
import { temSessao } from "@/data/supabase/servidor";
import { SecaoResponsaveis } from "@/features/configuracoes/SecaoResponsaveis";
import { sair } from "@/features/entrar/acoes";
import { itemDaRota } from "@/ui/navegacao";
import { Tela } from "@/ui/Tela";

const item = itemDaRota("/configuracoes");

export const metadata: Metadata = { title: `${item.titulo} · Conta Comigo` };

// Configurações: seções à esquerda, conteúdo à direita (EXPERIENCE.md).
// Por enquanto só Responsáveis (História 1.4); Tipos, Status, Ciclo e
// Aparência chegam nas Histórias 1.5 a 1.7. "Sair" fica no fim da lista e
// encerra a sessão neste aparelho.
export default async function PaginaConfiguracoes() {
  // Confere a sessão aqui também, sem depender só do proxy.
  if (!(await temSessao())) redirect("/entrar");

  return (
    <Tela titulo={item.titulo}>
      <div className="flex min-h-0 items-start gap-4">
        <nav
          aria-label={ROTULOS.secoes_configuracoes}
          className="flex w-48 shrink-0 flex-col gap-1 rounded-lg border border-border bg-surface p-2"
        >
          <a
            href="#titulo-responsaveis"
            aria-current="true"
            className="flex min-h-toque items-center rounded-sm bg-selection px-3 texto-body-strong text-text"
          >
            {ROTULOS.responsaveis}
          </a>
          <form action={sair}>
            <button
              type="submit"
              className="flex min-h-toque w-full cursor-pointer items-center rounded-sm px-3 text-left texto-body text-danger-fg"
            >
              {ROTULOS.sair}
            </button>
          </form>
        </nav>
        <div className="min-w-0 flex-1">
          <SecaoResponsaveis />
        </div>
      </div>
    </Tela>
  );
}
