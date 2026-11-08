"use client";

import { formatarDinheiro } from "@/domain/dinheiro";
import { comporTotalAPagar, type TotaisLidosDaFatura } from "@/domain/importacao-fatura";
import {
  TEXTOS_IMPORTAR,
  TEXTOS_PAINEL as T,
  rotuloComposicaoTotal,
  rotuloConferenciaTotal,
  rotuloFiltrarPor,
  rotuloLancamentos,
  rotuloTotalAPagar,
  sobrelinhaFatura,
} from "@/domain/mensagens";
import type { DistribuicaoPorResponsavel, FiltroResponsavel } from "@/domain/painel";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { classesPessoa } from "@/ui/cores-pessoa";

// Cartão da fatura do Mês aberto (`invoice-hero`, DESIGN.md): sobrelinha
// "FATURA DE OUTUBRO · VENCE 06/10/26", total a pagar em `hero-value`, a
// conta da 2.3 que chega nele (`comporTotalAPagar`) e a barra por
// Responsável. Tocar num segmento (ou na legenda) filtra a grade; tocar de
// novo limpa. Mês sem Fatura: "Fatura ainda não importada" com "Importar
// fatura". "Recebido no mês" e "Falta receber" chegam com os Recebimentos.

export type FaturaHero = TotaisLidosDaFatura & { mes: string; vencimento: string };

export type ResponsavelHero = { nome: string; cor: number };

export type PropsFaturaDoMes = {
  mes: string;
  fatura: FaturaHero | null;
  /** Valores dos Lançamentos não excluídos da Fatura (créditos negativos): a conta do total e a contagem. */
  valoresDaFaturaCentavos: readonly number[];
  distribuicao: DistribuicaoPorResponsavel;
  responsaveis: ReadonlyMap<string, ResponsavelHero>;
  filtro: FiltroResponsavel;
  aoFiltrar: (responsavelId: string | null) => void;
  aoImportar: () => void;
};

type Fatia = { id: string | null; nome: string; centavos: number; fundo: string };

function BarraPorResponsavel({
  fatias,
  filtro,
  aoFiltrar,
}: {
  fatias: readonly Fatia[];
  filtro: FiltroResponsavel;
  aoFiltrar: (id: string | null) => void;
}) {
  const filtrando = filtro !== undefined;
  return (
    <div className="flex flex-col gap-1">
      {/* Sem overflow-hidden: a área de toque de 44 pt passa da barra de 8 px. */}
      <div role="group" aria-label={T.distribuicao} className="flex h-2 w-full gap-px">
        {fatias.map((f) => (
          <button
            key={f.id ?? "sem"}
            type="button"
            aria-label={rotuloFiltrarPor(f.nome)}
            aria-pressed={filtro === f.id}
            onClick={() => aoFiltrar(f.id)}
            className={cn(
              "area-toque h-full min-w-1 basis-0 cursor-pointer first:rounded-l-full last:rounded-r-full",
              f.fundo,
              filtrando && filtro !== f.id && "opacity-40",
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
              aria-pressed={filtro === f.id}
              onClick={() => aoFiltrar(f.id)}
              className={cn(
                "inline-flex min-h-toque cursor-pointer items-center gap-1 texto-label text-text-muted",
                filtro === f.id && "text-text",
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

export function FaturaDoMes({
  mes,
  fatura,
  valoresDaFaturaCentavos,
  distribuicao,
  responsaveis,
  filtro,
  aoFiltrar,
  aoImportar,
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
    fatias.length > 0 ? <BarraPorResponsavel fatias={fatias} filtro={filtro} aoFiltrar={aoFiltrar} /> : null;

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
      <p className="texto-body text-text-muted">{rotuloLancamentos(valoresDaFaturaCentavos.length)}</p>
      <p className="texto-number text-text-muted">{rotuloComposicaoTotal(c)}</p>
      {selo ? (
        <p className={c.diferencaCentavos === 0 ? "texto-body-strong text-accent" : "texto-body-strong"}>{selo}</p>
      ) : null}
      {barra}
    </section>
  );
}
