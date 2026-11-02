"use client";

import { useId, useState } from "react";
import { useAvisarRascunhoDaLinha } from "./rascunho";
import { ROTULOS, mensagem, rotuloAcoesDe } from "@/domain/mensagens";
import { validarNomeTipo, type Tipo } from "@/domain/tipos";
import { cn } from "@/ui/cn";
import { MenuAcoes, type ItemMenuAcoes } from "@/ui/MenuAcoes";

// Uma linha da seção Tipos: nome editável (grava ao sair do campo ou com
// Enter; Esc desfaz o rascunho) e ⋯ com Arquivar ou Desarquivar e Excluir.

export type PropsLinhaTipo = {
  tipo: Tipo;
  /** Todos os Tipos (arquivados incluídos), para as regras do núcleo. */
  todos: readonly Tipo[];
  aoRenomear: (id: string, nome: string) => void;
  aoArquivar: (id: string) => void;
  aoDesarquivar: (id: string) => void;
  aoExcluir: (id: string) => void;
  /** Avisa quando o nome tem rascunho não salvo (só no Primeiro uso). */
  aoMudarRascunho?: (id: string, temRascunho: boolean) => void;
};

export function LinhaTipo({ tipo, todos, aoRenomear, aoArquivar, aoDesarquivar, aoExcluir, aoMudarRascunho }: PropsLinhaTipo) {
  const { id, nome, arquivado } = tipo;
  // Enquanto edita, o campo mostra o rascunho; fora disso, o nome da memória
  // (que volta sozinho ao anterior se o banco recusar).
  const [rascunho, setRascunho] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const idCampo = useId();
  const idErro = `${idCampo}-erro`;
  useAvisarRascunhoDaLinha(id, rascunho !== null, aoMudarRascunho);

  function confirmarNome() {
    if (rascunho === null) return;
    const r = validarNomeTipo(rascunho, todos, id);
    if (!r.ok) {
      setErro(mensagem(r.erro.codigo));
      return;
    }
    setErro(null);
    setRascunho(null);
    if (r.valor !== nome) aoRenomear(id, r.valor);
  }

  const itens: ItemMenuAcoes[] = [
    arquivado
      ? { rotulo: ROTULOS.desarquivar, aoEscolher: () => aoDesarquivar(id) }
      : { rotulo: ROTULOS.arquivar, aoEscolher: () => aoArquivar(id) },
    { rotulo: ROTULOS.excluir, aoEscolher: () => aoExcluir(id), destrutivo: true },
  ];

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle px-2 py-2 last:border-b-0">
      <div className="flex w-56 shrink-0 flex-col gap-1">
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
        {erro ? (
          <p id={idErro} className="texto-label font-normal text-danger-fg">
            {erro}
          </p>
        ) : null}
      </div>

      <div className="flex-1" />

      {arquivado ? (
        <span className="rounded-full border border-border px-2 py-0.5 texto-label text-text-muted">
          {ROTULOS.arquivado}
        </span>
      ) : null}

      <MenuAcoes rotulo={rotuloAcoesDe(nome)} itens={itens} />
    </li>
  );
}
