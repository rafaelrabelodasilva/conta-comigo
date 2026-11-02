"use client";

import { useId, useState } from "react";
import { ROTULOS, mensagem, rotuloAcoesDe } from "@/domain/mensagens";
import {
  coresLivres,
  podeMover,
  validarNome,
  type Direcao,
  type Responsavel,
} from "@/domain/responsaveis";
import { cn } from "@/ui/cn";
import { classesPessoa } from "@/ui/cores-pessoa";
import { MenuAcoes, type ItemMenuAcoes } from "@/ui/MenuAcoes";
import { SeletorCor } from "./SeletorCor";

// Uma linha da seção Responsáveis: nome editável (grava ao sair do campo),
// seletor de cor e ⋯ com Mover para cima/baixo, Arquivar/Desarquivar e Excluir.

export type PropsLinhaResponsavel = {
  responsavel: Responsavel;
  /** Todos os Responsáveis (arquivados incluídos), para as regras do núcleo. */
  todos: readonly Responsavel[];
  aoRenomear: (id: string, nome: string) => void;
  aoTrocarCor: (id: string, cor: number) => void;
  aoMover: (id: string, direcao: Direcao) => void;
  aoArquivar: (id: string) => void;
  aoDesarquivar: (id: string) => void;
  aoExcluir: (id: string) => void;
};

export function LinhaResponsavel({
  responsavel,
  todos,
  aoRenomear,
  aoTrocarCor,
  aoMover,
  aoArquivar,
  aoDesarquivar,
  aoExcluir,
}: PropsLinhaResponsavel) {
  const { id, nome, cor, arquivado } = responsavel;
  // Enquanto edita, o campo mostra o rascunho; fora disso, o nome da memória
  // (que volta sozinho ao anterior se o banco recusar).
  const [rascunho, setRascunho] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const idCampo = useId();
  const idErro = `${idCampo}-erro`;

  function confirmarNome() {
    if (rascunho === null) return;
    const r = validarNome(rascunho, todos, id);
    if (!r.ok) {
      setErro(mensagem(r.erro.codigo));
      return;
    }
    setErro(null);
    setRascunho(null);
    if (r.valor !== nome) aoRenomear(id, r.valor);
  }

  const mover = podeMover(todos, id);
  const excluir: ItemMenuAcoes = { rotulo: ROTULOS.excluir, aoEscolher: () => aoExcluir(id), destrutivo: true };
  const itens: ItemMenuAcoes[] = arquivado
    ? [{ rotulo: ROTULOS.desarquivar, aoEscolher: () => aoDesarquivar(id) }, excluir]
    : [
        ...(mover.cima
          ? [{ rotulo: ROTULOS.mover_para_cima, aoEscolher: () => aoMover(id, "cima") }]
          : []),
        ...(mover.baixo
          ? [{ rotulo: ROTULOS.mover_para_baixo, aoEscolher: () => aoMover(id, "baixo") }]
          : []),
        { rotulo: ROTULOS.arquivar, aoEscolher: () => aoArquivar(id) },
        excluir,
      ];

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle px-2 py-2 last:border-b-0">
      <div className="flex w-56 shrink-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span aria-hidden className={cn("size-3 shrink-0 rounded-full", classesPessoa(cor).fundo)} />
          <input
            id={idCampo}
            aria-label={ROTULOS.nome}
            value={rascunho ?? nome}
            maxLength={60}
            onChange={(e) => {
              setRascunho(e.target.value);
              setErro(null);
            }}
            onBlur={confirmarNome}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setRascunho(null);
                setErro(null);
              }
            }}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? idErro : undefined}
            className={cn(
              "min-h-toque w-full min-w-0 rounded-sm border border-border bg-background px-3 texto-body text-text",
              erro && "border-danger-fg",
              arquivado && "text-text-muted",
            )}
          />
        </div>
        {erro ? (
          <p id={idErro} className="texto-label font-normal text-danger-fg">
            {erro}
          </p>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <SeletorCor
          cor={cor}
          livres={coresLivres(todos, id)}
          nomeResponsavel={nome}
          aoEscolher={(nova) => aoTrocarCor(id, nova)}
        />
      </div>

      {arquivado ? (
        <span className="rounded-full border border-border px-2 py-0.5 texto-label text-text-muted">
          {ROTULOS.arquivado}
        </span>
      ) : null}

      <MenuAcoes rotulo={rotuloAcoesDe(nome)} itens={itens} />
    </li>
  );
}
