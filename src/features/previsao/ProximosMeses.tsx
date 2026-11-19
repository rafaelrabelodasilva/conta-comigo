"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatarMes } from "@/domain/datas";
import { formatarDinheiro } from "@/domain/dinheiro";
import {
  TEXTOS_PREVISAO as T,
  rotuloAbrirPainelDoMes,
  rotuloDaSerie,
  rotuloDoMesNaPrevisao,
  rotuloVerOutrasSeries,
} from "@/domain/mensagens";
import { mesAtual } from "@/domain/painel";
import {
  AGRUPAMENTOS,
  SERIES_VISIVEIS,
  projetarPrevisao,
  seriesEmAndamento,
  type Agrupamento,
  type GrupoDaPrevisao,
  type MesDaPrevisao,
} from "@/domain/previsao";
import { gerenciador, gerenciadorTodosOsLancamentos, useLinhas, useTodosOsLancamentos } from "@/data/realtime";
import { Botao } from "@/ui/Botao";
import { classesPessoa } from "@/ui/cores-pessoa";
import { cn } from "@/ui/cn";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { useHoje } from "@/ui/use-hoje";

// "Próximos meses" (História 7.1, FR-32, UX-DR23): barras empilhadas dos 6 Meses seguintes, a tabela Responsável × Mês e
// as Séries em andamento. Só desenha: a conta é `projetarPrevisao` e `seriesEmAndamento` (núcleo), a mesma projeção que o
// Painel de cada Mês soma (AD-11). Nada é gravado.
//
// - Dados (AD-4): os Lançamentos de TODOS os Meses vêm do gerenciador da 6.5 (`useTodosOsLancamentos`, canal único, que
//   Recebimentos também usa); aqui só interessam os Meses futuros, mas o filtro vive no núcleo. `faturas` marca o Mês
//   que já tem Fatura; `responsaveis` e `tipos` dão nome, ordem e cor. Nenhuma leitura avulsa.
// - Tocar num Mês (na barra ou no cabeçalho da tabela) abre o Painel dele (`/?mes=AAAA-MM`).
// - Acessibilidade: o gráfico é desenhado, e os mesmos números estão na tabela (e no nome de cada barra); a cor nunca
//   é a única informação (a legenda e a tabela dizem o nome); os alvos têm 44 pt.

const NOME_DO_AGRUPAMENTO: Record<Agrupamento, string> = {
  responsavel: T.por_responsavel,
  tipo: T.por_tipo,
};

const FUNDO_SEM_CADASTRO = "bg-text-muted";

function fundoDoGrupo(g: Pick<GrupoDaPrevisao, "cor">): string {
  return g.cor === null ? FUNDO_SEM_CADASTRO : classesPessoa(g.cor).fundo;
}

function NomeDoGrupo({ g }: { g: GrupoDaPrevisao }) {
  return (
    <>
      <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-sm", fundoDoGrupo(g))} />
      <span>{g.nome}</span>
      {g.arquivado ? <span className="texto-caption text-text-muted">({T.arquivado})</span> : null}
    </>
  );
}

function LinkDoMes({ mes, rotulo, className, children }: { mes: string; rotulo?: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={`/?mes=${mes}`} aria-label={rotulo ?? rotuloAbrirPainelDoMes(mes)} className={cn("rounded-sm", className)}>
      {children}
    </Link>
  );
}

export function ProximosMeses() {
  const lancamentos = useTodosOsLancamentos();
  const faturas = useLinhas("faturas");
  const responsaveis = useLinhas("responsaveis");
  const tipos = useLinhas("tipos");
  const hoje = useHoje();
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("responsavel");
  const [todasAsSeries, setTodasAsSeries] = useState(false);

  const retratos = [lancamentos, faturas, responsaveis, tipos];
  const erro = retratos.some((r) => r.status === "erro");
  const pronto = !erro && retratos.every((r) => r.status === "pronto");
  const atual = mesAtual(hoje);

  const previsao = useMemo(
    () =>
      projetarPrevisao(lancamentos.linhas, {
        mesAtual: atual,
        mesesComFatura: faturas.linhas.map((f) => f.mes),
        agrupamento,
        responsaveis: responsaveis.linhas,
        tipos: tipos.linhas,
      }),
    [lancamentos.linhas, faturas.linhas, responsaveis.linhas, tipos.linhas, atual, agrupamento],
  );
  const series = useMemo(() => seriesEmAndamento(lancamentos.linhas, atual), [lancamentos.linhas, atual]);

  function tentarDeNovo() {
    void gerenciadorTodosOsLancamentos().recarregar();
    for (const t of ["faturas", "responsaveis", "tipos"] as const) void gerenciador(t).recarregar();
  }

  if (erro) return <ErroAoCarregar aoTentarDeNovo={tentarDeNovo} />;
  if (!pronto) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">{T.carregando}</span>
        <Esqueleto className="h-64" />
        <Esqueleto className="h-32" />
      </div>
    );
  }
  if (previsao.vazia) return <EstadoVazio texto={T.vazio} />;

  const { meses, grupos, maiorBarraCentavos } = previsao;
  const seriesVisiveis = todasAsSeries ? series : series.slice(0, SERIES_VISIVEIS);

  return (
    <div className="flex flex-col gap-3">
      <section aria-labelledby="previsao-titulo" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="previsao-titulo" className="texto-title">
              {T.titulo}
            </h2>
            <p className="texto-caption text-text-muted">{T.ajuda}</p>
          </div>
          <div role="group" aria-label={T.agrupar} className="flex items-center gap-2">
            {AGRUPAMENTOS.map((a) => {
              const ligado = a === agrupamento;
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={ligado}
                  onClick={() => setAgrupamento(a)}
                  className={cn(
                    "inline-flex min-h-toque cursor-pointer items-center rounded-full border px-3 texto-body",
                    ligado ? "border-accent-line bg-selection text-text texto-body-strong" : "border-border bg-surface text-text-muted",
                  )}
                >
                  {NOME_DO_AGRUPAMENTO[a]}
                </button>
              );
            })}
          </div>
        </div>

        <ol aria-label={T.grafico} className="grid grid-cols-6 gap-2">
          {meses.map((m, i) => (
            <li key={m.mes}>
              <Barra mes={m} indice={i} grupos={grupos} maior={maiorBarraCentavos} />
            </li>
          ))}
        </ol>

        <ul aria-label={T.legenda} className="flex flex-wrap gap-x-4 gap-y-1 texto-caption text-text-muted">
          {grupos.map((g) => (
            <li key={g.chave} className="inline-flex items-center gap-1.5">
              <NomeDoGrupo g={g} />
            </li>
          ))}
        </ul>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse texto-number">
            <caption className="sr-only">{T.tabela}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-1 pr-3 text-left texto-label text-text-muted">
                  {agrupamento === "responsavel" ? T.coluna_responsavel : T.coluna_tipo}
                </th>
                {meses.map((m) => (
                  <th key={m.mes} scope="col" className="px-2 py-1 text-right texto-label text-text-muted">
                    <LinkDoMes mes={m.mes} className="inline-flex min-h-toque items-center justify-end text-text underline">
                      {formatarMes(m.mes)}
                    </LinkDoMes>
                    {m.temFatura ? <span className="block texto-caption font-normal text-text-muted">{T.fatura_importada}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.chave} className="border-b border-border-subtle">
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-text">
                    <span className="inline-flex items-center gap-1.5">
                      <NomeDoGrupo g={g} />
                    </span>
                  </th>
                  {g.porMes.map((v, i) => (
                    <td key={meses[i].mes} className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                      {formatarDinheiro(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="py-2 pr-3 text-left texto-body-strong text-text">
                  {T.linha_total}
                </th>
                {meses.map((m) => (
                  <td key={m.mes} className="whitespace-nowrap px-2 py-2 text-right tabular-nums texto-body-strong">
                    {formatarDinheiro(m.totalCentavos)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {series.length > 0 ? (
        <section aria-labelledby="previsao-series" className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
          <h2 id="previsao-series" className="texto-title">
            {T.series}
          </h2>
          <p className="texto-caption text-text-muted">{T.series_ajuda}</p>
          <ul className="flex flex-col gap-1">
            {seriesVisiveis.map((s) => (
              <li key={s.chave} className="texto-body text-text">
                {rotuloDaSerie(s)}
              </li>
            ))}
          </ul>
          {series.length > SERIES_VISIVEIS ? (
            <Botao variante="secundario" className="self-start" aria-expanded={todasAsSeries} onClick={() => setTodasAsSeries((v) => !v)}>
              {todasAsSeries ? T.ver_todas_as_series : rotuloVerOutrasSeries(series.length - SERIES_VISIVEIS)}
            </Botao>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** Uma barra: o total em cima, os segmentos por grupo (a cor de pessoa) e o Mês embaixo. Toda ela abre o Painel do Mês. */
function Barra({ mes, indice, grupos, maior }: { mes: MesDaPrevisao; indice: number; grupos: readonly GrupoDaPrevisao[]; maior: number }) {
  return (
    <LinkDoMes
      mes={mes.mes}
      rotulo={`${rotuloDoMesNaPrevisao(mes.mes, mes.totalCentavos)}. ${rotuloAbrirPainelDoMes(mes.mes)}`}
      className="flex min-h-toque flex-col items-stretch gap-1"
    >
      <span aria-hidden className="whitespace-nowrap text-center texto-caption tabular-nums text-text">
        {formatarDinheiro(mes.totalCentavos)}
      </span>
      <span aria-hidden className="flex h-40 flex-col-reverse gap-px overflow-hidden rounded-sm bg-background">
        {grupos.map((g) => {
          const v = g.porMes[indice];
          return v > 0 && maior > 0 ? (
            <span key={g.chave} className={cn("block w-full", fundoDoGrupo(g))} style={{ height: `${(v / maior) * 100}%`, minHeight: 2 }} />
          ) : null;
        })}
      </span>
      <span aria-hidden className="text-center texto-caption text-text-muted">
        {formatarMes(mes.mes)}
      </span>
      {mes.temFatura ? (
        <span aria-hidden className="text-center texto-caption text-text-muted">
          {T.fatura_importada}
        </span>
      ) : null}
    </LinkDoMes>
  );
}
