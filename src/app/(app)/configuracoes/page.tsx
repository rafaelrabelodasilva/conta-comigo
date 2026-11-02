import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ROTULOS } from "@/domain/mensagens";
import { temSessao } from "@/data/supabase/servidor";
import { SecaoAparencia } from "@/features/configuracoes/SecaoAparencia";
import { SecaoCiclo } from "@/features/configuracoes/SecaoCiclo";
import { SecaoConferencia } from "@/features/configuracoes/SecaoConferencia";
import { SecaoResponsaveis } from "@/features/configuracoes/SecaoResponsaveis";
import { SecaoStatus } from "@/features/configuracoes/SecaoStatus";
import { SecaoTipos } from "@/features/configuracoes/SecaoTipos";
import { CHAVES_SECAO, secaoEscolhida, type ChaveSecao } from "@/features/configuracoes/secoes";
import { sair } from "@/features/entrar/acoes";
import { cn } from "@/ui/cn";
import { itemDaRota } from "@/ui/navegacao";
import { Tela } from "@/ui/Tela";

const item = itemDaRota("/configuracoes");

export const metadata: Metadata = { title: `${item.titulo} · Conta Comigo` };

// Uma entrada por chave de CHAVES_SECAO (faltar uma é erro de tipo); a
// ordem da lista à esquerda é a de CHAVES_SECAO e a escolhida vem de `?secao=`.
const CONTEUDO_SECAO: Record<ChaveSecao, { rotulo: string; Conteudo: () => React.JSX.Element }> = {
  responsaveis: { rotulo: ROTULOS.responsaveis, Conteudo: SecaoResponsaveis },
  tipos: { rotulo: ROTULOS.tipos, Conteudo: SecaoTipos },
  status: { rotulo: ROTULOS.status, Conteudo: SecaoStatus },
  ciclo: { rotulo: ROTULOS.ciclo, Conteudo: SecaoCiclo },
  conferencia: { rotulo: ROTULOS.conferencia, Conteudo: SecaoConferencia },
  aparencia: { rotulo: ROTULOS.aparencia, Conteudo: SecaoAparencia },
};

const SECOES = CHAVES_SECAO.map((chave) => ({ chave, ...CONTEUDO_SECAO[chave] }));

// Configurações: seções à esquerda, conteúdo à direita (EXPERIENCE.md).
// "Sair" fica no fim da lista e encerra a sessão neste aparelho.
export default async function PaginaConfiguracoes({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  // Confere a sessão aqui também, sem depender só do proxy.
  if (!(await temSessao())) redirect("/entrar");

  const chave = secaoEscolhida((await searchParams).secao);
  const { Conteudo } = CONTEUDO_SECAO[chave];

  return (
    <Tela titulo={item.titulo}>
      <div className="flex min-h-0 items-start gap-4">
        <nav
          aria-label={ROTULOS.secoes_configuracoes}
          className="flex w-48 shrink-0 flex-col gap-1 rounded-lg border border-border bg-surface p-2"
        >
          {SECOES.map((s) => {
            const ativa = s.chave === chave;
            return (
              <Link
                key={s.chave}
                href={`/configuracoes?secao=${s.chave}`}
                aria-current={ativa ? "page" : undefined}
                className={cn(
                  "flex min-h-toque items-center rounded-sm px-3 text-text",
                  ativa ? "bg-selection texto-body-strong" : "texto-body",
                )}
              >
                {s.rotulo}
              </Link>
            );
          })}
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
          <Conteudo />
        </div>
      </div>
    </Tela>
  );
}
