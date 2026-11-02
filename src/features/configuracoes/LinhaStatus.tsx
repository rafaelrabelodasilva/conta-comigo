"use client";

import { useId, useState } from "react";
import {
  ROTULOS,
  mensagem,
  rotuloAcoesDe,
  rotuloContaComoPagoDe,
  rotuloRegistros,
} from "@/domain/mensagens";
import { validarNomeStatus, type Status } from "@/domain/status";
import { cn } from "@/ui/cn";
import { MenuAcoes, type ItemMenuAcoes } from "@/ui/MenuAcoes";

// Uma linha da seção Status: nome editável (grava ao sair do campo ou com
// Enter; Esc desfaz o rascunho), chave "Conta como pago", "N registros"
// (contagem de uso) e ⋯ com Arquivar ou Desarquivar e Excluir.

export type PropsLinhaStatus = {
  status: Status & { conta_como_pago: boolean };
  /** Todos os Status (arquivados incluídos), para as regras do núcleo. */
  todos: readonly Status[];
  /** Quantos registros usam este Status; `null` enquanto a contagem não chegou. */
  usos: number | null;
  aoRenomear: (id: string, nome: string) => void;
  aoMudarContaComoPago: (id: string, contaComoPago: boolean) => void;
  aoArquivar: (id: string) => void;
  aoDesarquivar: (id: string) => void;
  aoExcluir: (id: string) => void;
};

export function LinhaStatus({
  status,
  todos,
  usos,
  aoRenomear,
  aoMudarContaComoPago,
  aoArquivar,
  aoDesarquivar,
  aoExcluir,
}: PropsLinhaStatus) {
  const { id, nome, arquivado, conta_como_pago: contaComoPago } = status;
  // Enquanto edita, o campo mostra o rascunho; fora disso, o nome da memória
  // (que volta sozinho ao anterior se o banco recusar).
  const [rascunho, setRascunho] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const idCampo = useId();
  const idErro = `${idCampo}-erro`;

  function confirmarNome() {
    if (rascunho === null) return;
    const r = validarNomeStatus(rascunho, todos, id);
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

      <label className="flex min-h-toque cursor-pointer items-center gap-2 texto-body text-text">
        <button
          type="button"
          role="switch"
          aria-checked={contaComoPago}
          aria-label={rotuloContaComoPagoDe(nome)}
          onClick={() => aoMudarContaComoPago(id, !contaComoPago)}
          className={cn(
            "area-toque relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border transition-colors",
            contaComoPago ? "border-accent bg-accent" : "border-border bg-background",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "inline-block size-4 rounded-full transition-transform",
              contaComoPago ? "translate-x-5 bg-accent-foreground" : "translate-x-1 bg-text-muted",
            )}
          />
        </button>
        <span aria-hidden>{ROTULOS.conta_como_pago}</span>
      </label>

      <div className="flex-1" />

      <span className="texto-label font-normal text-text-muted tabular-nums">
        {usos === null ? "" : rotuloRegistros(usos)}
      </span>

      {arquivado ? (
        <span className="rounded-full border border-border px-2 py-0.5 texto-label text-text-muted">
          {ROTULOS.arquivado}
        </span>
      ) : null}

      <MenuAcoes rotulo={rotuloAcoesDe(nome)} itens={itens} />
    </li>
  );
}
