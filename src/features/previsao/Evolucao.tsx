"use client";

import { useMemo, useState } from "react";
import { TEXTOS_PREVISAO as T, tituloDaEvolucao } from "@/domain/mensagens";
import { projetarEvolucao, type Agrupamento } from "@/domain/previsao";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { EsqueletoDaPrevisao, useDadosDaPrevisao } from "./dados-da-previsao";
import { GraficoPorMes, SeletorDeAgrupamento } from "./GraficoPorMes";

// "Evolução" (História 7.2, FR-33, UX-DR23): barras empilhadas dos últimos 6 Meses com Fatura importada, por Responsável
// ou por Tipo, e a tabela Grupo × Mês em texto. Só desenha: a conta é `projetarEvolucao` (núcleo), a mesma projeção que o
// Painel de cada Mês soma no Bloco "Todos" (AD-11). Nada é gravado.
//
// - Dados (AD-4): os mesmos da aba "Próximos meses" (`useDadosDaPrevisao`): nenhum gerenciador novo, nenhuma leitura
//   avulsa e nenhum custo de memória além do que já existe.
// - O seletor é desta aba: não divide a escolha com "Próximos meses" (cada aba abre em "Por Responsável").
// - Com menos de 2 Meses importados não há gráfico, tabela nem seletor: só o texto do aceite.

export function Evolucao() {
  const { lancamentos, faturas, responsaveis, tipos, erro, pronto, atual, tentarDeNovo } = useDadosDaPrevisao();
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("responsavel");

  const evolucao = useMemo(
    () =>
      projetarEvolucao(lancamentos.linhas, {
        mesAtual: atual,
        mesesComFatura: faturas.linhas.map((f) => f.mes),
        agrupamento,
        responsaveis: responsaveis.linhas,
        tipos: tipos.linhas,
      }),
    [lancamentos.linhas, faturas.linhas, responsaveis.linhas, tipos.linhas, atual, agrupamento],
  );

  if (erro) return <ErroAoCarregar aoTentarDeNovo={tentarDeNovo} />;
  if (!pronto) return <EsqueletoDaPrevisao texto={T.carregando_evolucao} />;
  if (!evolucao.disponivel) return <EstadoVazio texto={T.evolucao_minimo} />;

  const { meses, grupos, maiorBarraCentavos, temBuraco } = evolucao;

  return (
    <section aria-labelledby="evolucao-titulo" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="evolucao-titulo" className="texto-title">
            {tituloDaEvolucao(meses.length)}
          </h2>
          <p className="texto-caption text-text-muted">{T.evolucao_ajuda}</p>
          {temBuraco ? <p className="texto-caption text-text-muted">{T.evolucao_buraco}</p> : null}
        </div>
        <SeletorDeAgrupamento agrupamento={agrupamento} aoEscolher={setAgrupamento} />
      </div>

      <GraficoPorMes meses={meses} grupos={grupos} maiorBarraCentavos={maiorBarraCentavos} agrupamento={agrupamento} mostrarSeloDeFatura={false} />
    </section>
  );
}
