"use client";

import type { Conferencia } from "@/domain/conferencia";
import { formatarDinheiro } from "@/domain/dinheiro";
import { comporTotalAPagar, type TotaisLidosDaFatura } from "@/domain/importacao-fatura";
import {
  TEXTOS_HERO,
  TEXTOS_IMPORTAR,
  TEXTOS_PAINEL as T,
  rotuloComposicaoTotal,
  rotuloConferenciaTotal,
  rotuloFaltaReceber,
  rotuloFiltrarPor,
  rotuloLancamentos,
  rotuloBotaoDiferenca,
  rotuloSeloConferencia,
  rotuloTotalAPagar,
  sobrelinhaFatura,
  sobrelinhaHistorico,
} from "@/domain/mensagens";
import type { ValorFiltro } from "@/domain/filtros-grade";
import type { DistribuicaoPorResponsavel } from "@/domain/painel";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { classesPessoa } from "@/ui/cores-pessoa";

// Cartão da fatura do Mês aberto (`invoice-hero`, DESIGN.md): sobrelinha
// "FATURA DE OUTUBRO · VENCE 06/10/26", total a pagar em `hero-value`, a
// conta da 2.3 que chega nele (`comporTotalAPagar`) e a barra por
// Responsável. Tocar num segmento (ou na legenda) escreve na coluna
// Responsável da barra de filtros (História 2.6): se o filtro já é só ele,
// limpa; senão, passa a ser só ele. Fica marcado quem está entre os
// escolhidos; os outros segmentos se apagam. Mês sem Fatura: "Fatura
// ainda não importada" com "Importar fatura". Embaixo (História 6.5, FR-26), dois mini-cartões: "Recebido no mês" (os
// Pagamentos com data no Mês) e "Falta receber" (os Blocos de cobrança sobre o que está em aberto no Mês); tocar em
// "Falta receber" abre Recebimentos. Os valores vêm prontos do núcleo (`recebidoNoMes`, `faltaReceberDoMes`); `null` é
// "—" (ainda lendo, ou nenhum Bloco de cobrança). Num Mês sem Fatura e sem histórico não há mini-cartões.
// Selo da Conferência (História 2.5) na linha da quantidade: "✓ Conferido
// · 49 lançamentos" ou "⚠ Diferença de R$ X" (toque liga o filtro
// "Verificar"); a conta do total e o "Bate" ficam embaixo, menores.

export type FaturaHero = TotaisLidosDaFatura & { mes: string; vencimento: string };

export type ResponsavelHero = { nome: string; cor: number };

/** Os dois mini-cartões do hero; `null` em um valor é "—". */
export type RecebimentosDoHero = { recebidoCentavos: number | null; faltaCentavos: number | null };

export type PropsFaturaDoMes = {
  mes: string;
  fatura: FaturaHero | null;
  /** Valores dos Lançamentos não excluídos da Fatura (créditos negativos): a conta do total e a contagem. */
  valoresDaFaturaCentavos: readonly number[];
  distribuicao: DistribuicaoPorResponsavel;
  responsaveis: ReadonlyMap<string, ResponsavelHero>;
  /** Os escolhidos na coluna Responsável da barra de filtros (vazio: sem filtro). */
  escolhidos: readonly ValorFiltro[];
  aoFiltrar: (responsavelId: string | null) => void;
  aoImportar: () => void;
  /** Conferência da Fatura (`conferir`); sem ela, sem selo. */
  conferencia?: Conferencia | null;
  /** Toque no selo de diferença: liga o filtro "Verificar". */
  aoVerificar?: () => void;
  /**
   * Mês sem Fatura com linhas do histórico da planilha (História 3.10): o hero
   * mostra o total delas e a barra por Responsável, sem selo de Conferência.
   */
  historico?: { totalCentavos: number; quantidade: number } | null;
  /** "Recebido no mês" e "Falta receber"; ausente, os mini-cartões não aparecem. */
  recebimentos?: RecebimentosDoHero | null;
  /** Toque em "Falta receber": abre Recebimentos. */
  aoAbrirRecebimentos?: () => void;
};

type Fatia = { id: string | null; nome: string; centavos: number; fundo: string };

function BarraPorResponsavel({
  fatias,
  escolhidos,
  aoFiltrar,
}: {
  fatias: readonly Fatia[];
  escolhidos: readonly ValorFiltro[];
  aoFiltrar: (id: string | null) => void;
}) {
  const filtrando = escolhidos.length > 0;
  const marcado = (id: string | null) => escolhidos.includes(id);
  return (
    <div className="flex flex-col gap-1">
      {/* Sem overflow-hidden: a área de toque de 44 pt passa da barra de 8 px. */}
      <div role="group" aria-label={T.distribuicao} className="flex h-2 w-full gap-px">
        {fatias.map((f) => (
          <button
            key={f.id ?? "sem"}
            type="button"
            aria-label={rotuloFiltrarPor(f.nome)}
            aria-pressed={marcado(f.id)}
            onClick={() => aoFiltrar(f.id)}
            className={cn(
              "area-toque h-full min-w-1 basis-0 cursor-pointer first:rounded-l-full last:rounded-r-full",
              f.fundo,
              filtrando && !marcado(f.id) && "opacity-40",
            )}
            style={{ flexGrow: f.centavos }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3">
        {fatias.map((f) => (
          <li key={f.id ?? "sem"}>
            <button
              type="button"
              aria-pressed={marcado(f.id)}
              onClick={() => aoFiltrar(f.id)}
              className={cn(
                "inline-flex min-h-toque cursor-pointer items-center gap-1 texto-label text-text-muted",
                marcado(f.id) && "text-text",
              )}
            >
              <span aria-hidden className={cn("inline-block size-2 rounded-full", f.fundo)} />
              {f.nome}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniCartoes({ recebimentos, aoAbrir }: { recebimentos: RecebimentosDoHero; aoAbrir?: () => void }) {
  const recebido = recebimentos.recebidoCentavos === null ? TEXTOS_HERO.sem_valor : formatarDinheiro(recebimentos.recebidoCentavos);
  const falta = recebimentos.faltaCentavos === null ? TEXTOS_HERO.sem_valor : formatarDinheiro(recebimentos.faltaCentavos);
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="flex min-h-toque flex-col justify-center rounded-md bg-background px-3 py-1.5">
        <p className="texto-caption text-text-muted">{TEXTOS_HERO.recebido_no_mes}</p>
        <p className="texto-body-strong tabular-nums text-accent">{recebido}</p>
      </div>
      <button
        type="button"
        aria-label={rotuloFaltaReceber(falta)}
        onClick={aoAbrir}
        className="flex min-h-toque cursor-pointer flex-col justify-center rounded-md bg-background px-3 py-1.5 text-left"
      >
        <span aria-hidden className="texto-caption text-text-muted">
          {TEXTOS_HERO.falta_receber}
        </span>
        <span aria-hidden className="texto-body-strong tabular-nums">
          {falta}
        </span>
      </button>
    </div>
  );
}

function SeloConferencia({ conferencia, aoVerificar }: { conferencia: Conferencia; aoVerificar?: () => void }) {
  const texto = rotuloSeloConferencia(conferencia);
  if (conferencia.conferido) return <span className="texto-body-strong text-accent">{texto}</span>;
  return (
    <button
      type="button"
      aria-label={rotuloBotaoDiferenca(conferencia)}
      onClick={aoVerificar}
      className="area-toque inline-flex cursor-pointer items-center rounded-full border border-alert-warning-border bg-alert-warning-bg px-2 texto-body-strong text-text"
    >
      {texto}
    </button>
  );
}

export function FaturaDoMes({
  mes,
  fatura,
  valoresDaFaturaCentavos,
  distribuicao,
  responsaveis,
  escolhidos,
  aoFiltrar,
  aoImportar,
  conferencia = null,
  aoVerificar,
  historico = null,
  recebimentos = null,
  aoAbrirRecebimentos,
}: PropsFaturaDoMes) {
  const fatias: Fatia[] = distribuicao.segmentos.map((s) => {
    const r = responsaveis.get(s.responsavelId);
    return {
      id: s.responsavelId,
      nome: r?.nome ?? T.vazio,
      centavos: s.centavos,
      fundo: classesPessoa(r?.cor ?? 1).fundo,
    };
  });
  if (distribuicao.semResponsavelCentavos > 0) {
    // Cor neutra: "sem responsável" não é uma pessoa.
    fatias.push({ id: null, nome: T.sem_responsavel, centavos: distribuicao.semResponsavelCentavos, fundo: "bg-text-muted" });
  }
  const barra =
    fatias.length > 0 ? <BarraPorResponsavel fatias={fatias} escolhidos={escolhidos} aoFiltrar={aoFiltrar} /> : null;

  if (!fatura && historico) {
    const sobrelinha = sobrelinhaHistorico(mes);
    return (
      <section aria-label={sobrelinha} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <p className="texto-eyebrow text-text-muted">{sobrelinha}</p>
        <p className="texto-hero-value">
          <span className="sr-only">{`${T.total_historico} `}</span>
          {formatarDinheiro(historico.totalCentavos)}
        </p>
        <p className="texto-body text-text-muted">
          {rotuloLancamentos(historico.quantidade)} · {T.do_historico}
        </p>
        {barra}
        {recebimentos ? <MiniCartoes recebimentos={recebimentos} aoAbrir={aoAbrirRecebimentos} /> : null}
      </section>
    );
  }

  if (!fatura) {
    return (
      <section aria-label={sobrelinhaFatura(mes, null)} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <p className="texto-eyebrow text-text-muted">{sobrelinhaFatura(mes, null)}</p>
        <p className="texto-title">{T.sem_fatura}</p>
        <div>
          <Botao variante="primario" onClick={aoImportar}>
            <span aria-hidden>＋</span>
            {TEXTOS_IMPORTAR.botao}
          </Botao>
        </div>
        {barra}
      </section>
    );
  }

  const c = comporTotalAPagar(fatura, valoresDaFaturaCentavos);
  const selo = rotuloConferenciaTotal(c);
  const sobrelinha = sobrelinhaFatura(fatura.mes, fatura.vencimento);
  return (
    <section aria-label={sobrelinha} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <p className="texto-eyebrow text-text-muted">{sobrelinha}</p>
      {c.lidoCentavos === null ? (
        // Sem o total lido, não há "total a pagar" para mostrar como se fosse.
        <p className="texto-title">{rotuloTotalAPagar(null)}</p>
      ) : (
        <p className="texto-hero-value">
          <span className="sr-only">{`${T.total_a_pagar} `}</span>
          {formatarDinheiro(c.lidoCentavos)}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-1.5 texto-body text-text-muted">
        {conferencia ? (
          <>
            <SeloConferencia conferencia={conferencia} aoVerificar={aoVerificar} />
            <span aria-hidden>·</span>
          </>
        ) : null}
        <span>{rotuloLancamentos(valoresDaFaturaCentavos.length)}</span>
      </p>
      <p className="texto-caption tabular-nums text-text-muted">{rotuloComposicaoTotal(c)}</p>
      {selo ? <p className={c.diferencaCentavos === 0 ? "texto-caption text-accent" : "texto-caption"}>{selo}</p> : null}
      {barra}
      {recebimentos ? <MiniCartoes recebimentos={recebimentos} aoAbrir={aoAbrirRecebimentos} /> : null}
    </section>
  );
}
