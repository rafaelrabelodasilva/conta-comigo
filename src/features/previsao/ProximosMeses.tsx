"use client";

import { useMemo, useState } from "react";
import { TEXTOS_PREVISAO as T, rotuloDaSerie, rotuloVerOutrasSeries } from "@/domain/mensagens";
import { SERIES_VISIVEIS, projetarPrevisao, seriesEmAndamento, type Agrupamento } from "@/domain/previsao";
import { Botao } from "@/ui/Botao";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { EsqueletoDaPrevisao, useDadosDaPrevisao } from "./dados-da-previsao";
import { GraficoPorMes, SeletorDeAgrupamento } from "./GraficoPorMes";

// "Próximos meses" (História 7.1, FR-32, UX-DR23): barras empilhadas dos 6 Meses seguintes, a tabela Responsável × Mês e
// as Séries em andamento. Só desenha: a conta é `projetarPrevisao` e `seriesEmAndamento` (núcleo), a mesma projeção que o
// Painel de cada Mês soma (AD-11). Nada é gravado.
//
// - Dados (AD-4): `useDadosDaPrevisao` (os Lançamentos de TODOS os Meses da 6.5, `faturas`, `responsaveis` e `tipos`); aqui
//   só interessam os Meses futuros, mas o filtro vive no núcleo. Nenhuma leitura avulsa.
// - O desenho (seletor, barras, legenda, tabela, toque no Mês) é o de `GraficoPorMes`, que a Evolução (7.2) também usa.
// - Acessibilidade: o gráfico é desenhado, e os mesmos números estão na tabela (e no nome de cada barra); a cor nunca
//   é a única informação (a legenda e a tabela dizem o nome); os alvos têm 44 pt.

export function ProximosMeses() {
  const { lancamentos, faturas, responsaveis, tipos, erro, pronto, atual, tentarDeNovo } = useDadosDaPrevisao();
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("responsavel");
  const [todasAsSeries, setTodasAsSeries] = useState(false);

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

  if (erro) return <ErroAoCarregar aoTentarDeNovo={tentarDeNovo} />;
  if (!pronto) return <EsqueletoDaPrevisao />;
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
          <SeletorDeAgrupamento agrupamento={agrupamento} aoEscolher={setAgrupamento} />
        </div>

        <GraficoPorMes meses={meses} grupos={grupos} maiorBarraCentavos={maiorBarraCentavos} agrupamento={agrupamento} mostrarSeloDeFatura />
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
