"use client";

import Link from "next/link";
import { formatarMes } from "@/domain/datas";
import { formatarDinheiro } from "@/domain/dinheiro";
import { TEXTOS_PREVISAO as T, rotuloAbrirPainelDoMes, rotuloDoMesNaPrevisao } from "@/domain/mensagens";
import { AGRUPAMENTOS, MESES_DA_PREVISAO, type Agrupamento, type GrupoDaPrevisao, type MesDaPrevisao } from "@/domain/previsao";
import { classesPessoa } from "@/ui/cores-pessoa";
import { cn } from "@/ui/cn";

// O desenho que "Próximos meses" (7.1) e "Evolução" (7.2) dividem (`chart-bar`, UX-DR23): o seletor "Por Responsável / Por
// Tipo", as barras empilhadas (total em cima, segmentos `person-N`, Mês embaixo), a legenda e a tabela Grupo × Mês. Só
// desenha o que o núcleo (`projetarPrevisao`, `projetarEvolucao`) entrega; nenhuma conta mora aqui.
//
// - A tabela e o nome acessível de cada barra trazem os mesmos números do gráfico, e a legenda e a tabela dizem o nome
//   de cada grupo: a cor nunca é a única informação. Os alvos têm 44 pt.
// - Tocar num Mês (na barra ou no cabeçalho da tabela) abre o Painel dele (`/?mes=AAAA-MM`).
// - `mostrarSeloDeFatura`: "Próximos meses" diz "Fatura importada" no Mês da janela que já tem Fatura; na Evolução todo
//   Mês tem Fatura e o selo repetido não diz nada.
// - As barras ocupam `meses.length / 6` da largura: com menos de 6 Meses (Evolução) cada barra tem a largura de uma
//   barra de 6, centralizada, e não estica.

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

/** "Por Responsável / Por Tipo" (`aria-pressed`, 44 pt). */
export function SeletorDeAgrupamento({ agrupamento, aoEscolher }: { agrupamento: Agrupamento; aoEscolher: (a: Agrupamento) => void }) {
  return (
    <div role="group" aria-label={T.agrupar} className="flex items-center gap-2">
      {AGRUPAMENTOS.map((a) => {
        const ligado = a === agrupamento;
        return (
          <button
            key={a}
            type="button"
            aria-pressed={ligado}
            onClick={() => aoEscolher(a)}
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
  );
}

type Dados = {
  meses: readonly MesDaPrevisao[];
  grupos: readonly GrupoDaPrevisao[];
  mostrarSeloDeFatura: boolean;
};

/** As barras, a legenda e a tabela de um conjunto de Meses. */
export function GraficoPorMes({
  meses,
  grupos,
  maiorBarraCentavos,
  agrupamento,
  mostrarSeloDeFatura,
}: Dados & { maiorBarraCentavos: number; agrupamento: Agrupamento }) {
  return (
    <>
      <ol
        aria-label={T.grafico}
        className="mx-auto grid gap-2"
        style={{ width: `${(Math.min(meses.length, MESES_DA_PREVISAO) / MESES_DA_PREVISAO) * 100}%`, gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))` }}
      >
        {meses.map((m, i) => (
          <li key={m.mes}>
            <Barra mes={m} indice={i} grupos={grupos} maior={maiorBarraCentavos} mostrarSeloDeFatura={mostrarSeloDeFatura} />
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

      <TabelaPorMes meses={meses} grupos={grupos} agrupamento={agrupamento} mostrarSeloDeFatura={mostrarSeloDeFatura} />
    </>
  );
}

function TabelaPorMes({ meses, grupos, agrupamento, mostrarSeloDeFatura }: Dados & { agrupamento: Agrupamento }) {
  return (
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
                {mostrarSeloDeFatura && m.temFatura ? <span className="block texto-caption font-normal text-text-muted">{T.fatura_importada}</span> : null}
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
  );
}

/** Uma barra: o total em cima, os segmentos por grupo (a cor de pessoa) e o Mês embaixo. Toda ela abre o Painel do Mês. */
function Barra({
  mes,
  indice,
  grupos,
  maior,
  mostrarSeloDeFatura,
}: {
  mes: MesDaPrevisao;
  indice: number;
  grupos: readonly GrupoDaPrevisao[];
  maior: number;
  mostrarSeloDeFatura: boolean;
}) {
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
      {mostrarSeloDeFatura && mes.temFatura ? (
        <span aria-hidden className="text-center texto-caption text-text-muted">
          {T.fatura_importada}
        </span>
      ) : null}
    </LinkDoMes>
  );
}
