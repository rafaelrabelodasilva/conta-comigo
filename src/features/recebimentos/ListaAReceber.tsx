"use client";

import Link from "next/link";
import { useState } from "react";
import { formatarMes } from "@/domain/datas";
import { formatarDinheiro } from "@/domain/dinheiro";
import type { LinhaAReceber } from "@/domain/divida";
import {
  ROTULO_ATRASADO,
  TEXTOS_DIVIDA as T,
  TEXTOS_RECEBIMENTOS,
  rotuloAbrirDivida,
  rotuloAtrasadoDesde,
  rotuloPeriodoDaDivida,
  rotuloVenceEm,
  rotuloVerLancamentosDaDivida,
} from "@/domain/mensagens";
import { cn } from "@/ui/cn";
import { classesPessoa } from "@/ui/cores-pessoa";
import { Esqueleto } from "@/ui/Esqueleto";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { SeloStatus } from "@/ui/SeloStatus";

// "A receber" (História 6.6, FR-27, UX-DR19): as Dívidas programadas em aberto, ordenadas pela data combinada
// (Nome ou Apelido, Responsável, vencimento, valor). As vencidas levam o selo "Atrasado" (calculado pelo núcleo,
// com o vencimento combinado). Tudo o que a lista diz vem de `aReceber`: ela só desenha.
//
// Tocar abre o painel do Lançamento. Recebimentos não tem painel (o repositório de Lançamentos guarda só o Mês
// aberto, AD-4), então o toque leva ao Painel já naquele Mês, com o painel lateral aberto
// (\`/?mes=AAAA-MM&lancamento=<id>\`). Uma linha de vários lançamentos (a Bombinhas do Lucas, 6 parcelas em
// R$ 636,00) é um interruptor que mostra os lançamentos, cada um com o próprio toque.

export type CadastrosDaLista = {
  responsaveis: ReadonlyMap<string, { nome: string; cor: number }>;
};

/** O endereço do painel de um Lançamento no Painel do Mês dele. */
export function enderecoDoLancamento(mes: string, id: string): string {
  return `/?mes=${mes}&lancamento=${id}`;
}

function Etiqueta({ responsavelId, cadastros }: { responsavelId: string | null; cadastros: CadastrosDaLista }) {
  const dono = responsavelId === null ? undefined : cadastros.responsaveis.get(responsavelId);
  return dono ? (
    <span className={cn("rounded-full px-2 texto-label", classesPessoa(dono.cor).etiqueta)}>{dono.nome}</span>
  ) : (
    <span className="rounded-full bg-border-subtle px-2 texto-label text-text-muted">{TEXTOS_RECEBIMENTOS.sem_responsavel}</span>
  );
}

function Atraso({ desde }: { desde: string | null }) {
  return desde === null ? null : (
    <SeloStatus variante="atrasado" title={rotuloAtrasadoDesde(desde)}>
      {ROTULO_ATRASADO}
    </SeloStatus>
  );
}

const LINHA = "flex min-h-toque w-full items-center gap-3 px-3.5 py-1.5 text-left";

function Linha({ linha, cadastros }: { linha: LinhaAReceber; cadastros: CadastrosDaLista }) {
  const [aberta, setAberta] = useState(false);
  const valor = formatarDinheiro(linha.valorCentavos);
  const um = linha.itens.length === 1;
  const corpo = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="min-w-0 truncate texto-body">{linha.nome}</span>
          <Etiqueta responsavelId={linha.responsavelId} cadastros={cadastros} />
        </span>
        <span className="texto-caption text-text-muted">{rotuloPeriodoDaDivida(linha.itens.map((i) => i.mes))}</span>
        {linha.observacao ? <span className="texto-caption text-text-muted">{linha.observacao}</span> : null}
      </span>
      <Atraso desde={linha.atrasadoDesde} />
      <span className="whitespace-nowrap texto-caption text-text-muted">{rotuloVenceEm(linha.vencimento)}</span>
      <span className="min-w-[5.5rem] text-right texto-number tabular-nums">{valor}</span>
    </>
  );
  if (um) {
    return (
      <li>
        <Link
          href={enderecoDoLancamento(linha.itens[0].mes, linha.itens[0].id)}
          aria-label={rotuloAbrirDivida(linha.nome, linha.vencimento, valor)}
          className={cn(LINHA, "cursor-pointer")}
        >
          {corpo}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        aria-expanded={aberta}
        aria-label={rotuloVerLancamentosDaDivida(linha.nome, valor)}
        title={aberta ? T.esconder_lancamentos : T.ver_lancamentos}
        onClick={() => setAberta((a) => !a)}
        className={cn(LINHA, "cursor-pointer")}
      >
        {corpo}
        <span aria-hidden className="shrink-0 text-text-muted">
          {aberta ? "▴" : "▾"}
        </span>
      </button>
      {aberta ? (
        <ul className="flex flex-col border-t border-border-subtle">
          {linha.itens.map((i) => {
            const restante = formatarDinheiro(i.restanteCentavos);
            const mes = formatarMes(i.mes);
            return (
              <li key={i.id}>
                <Link
                  href={enderecoDoLancamento(i.mes, i.id)}
                  aria-label={rotuloAbrirDivida(`${linha.nome}, ${mes}`, linha.vencimento, restante)}
                  className={cn(LINHA, "cursor-pointer pl-8")}
                >
                  <span className="min-w-0 flex-1 texto-body">{mes}</span>
                  <Atraso desde={i.atrasadoDesde} />
                  <span className="min-w-[5.5rem] text-right texto-number tabular-nums">{restante}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

export function ListaAReceber({
  linhas,
  cadastros,
  carregando,
}: {
  linhas: readonly LinhaAReceber[];
  cadastros: CadastrosDaLista;
  /** Os dados ainda não chegaram: o esqueleto no lugar da lista (e de "Nenhuma dívida programada"). */
  carregando: boolean;
}) {
  return (
    <section aria-labelledby="titulo-a-receber" className="flex flex-col gap-2">
      <h2 id="titulo-a-receber" className="flex min-h-toque items-center texto-body-strong">
        {T.a_receber}
      </h2>
      {carregando ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">{T.carregando}</span>
          <Esqueleto className="h-12" />
          <Esqueleto className="h-12" />
        </div>
      ) : linhas.length === 0 ? (
        <EstadoVazio texto={T.sem_dividas} className="p-4" />
      ) : (
        <>
          <p className="texto-caption text-text-muted">{T.a_receber_ajuda}</p>
          <ul aria-label={T.a_receber} className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border bg-surface">
            {linhas.map((l) => (
              <Linha key={l.chave} linha={l} cadastros={cadastros} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
