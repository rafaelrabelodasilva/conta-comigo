"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { lerBlocos } from "@/domain/blocos";
import { formatarDinheiro } from "@/domain/dinheiro";
import { textoDaFormula } from "@/domain/formula";
import {
  TEXTOS_PREVISAO as T,
  rotuloDaBarraDoMeuGasto,
  rotuloDoBlocoDoMeuGasto,
  textoMeuGastoSemValor,
  tituloDoMeuGasto,
} from "@/domain/mensagens";
import {
  enderecoDoPainelPorTipo,
  mesesComLancamentos,
  mesesDoMeuGasto,
  projetarMeuGasto,
  type BarraDoMeuGasto,
} from "@/domain/meu-gasto";
import { gerenciador, useLinhas } from "@/data/realtime";
import { SECAO_COBRANCA } from "@/features/configuracoes/secoes";
import { SeletorMes } from "@/features/painel/SeletorMes";
import { Botao } from "@/ui/Botao";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { EsqueletoDaPrevisao, useDadosDaPrevisao } from "./dados-da-previsao";

// "Meu gasto por Tipo" (História 7.3, FR-31, UX-DR23): para o Mês do seletor desta aba, o "meu Bloco" (Configurações →
// "É o meu Bloco") repartido por Tipo, em barras horizontais do maior para o menor, com o valor e a % do total. Só
// desenha: a conta é `projetarMeuGasto` (núcleo), sobre a mesma projeção que o Painel daquele Mês dá ao Bloco (AD-11), e
// a soma das barras é o valor do Bloco. Nada é gravado.
//
// - Dados (AD-4): os da Previsão (`useDadosDaPrevisao`) mais `blocos`, pelo gerenciador que o Painel já usa: nenhum
//   gerenciador novo, nenhuma leitura avulsa e nenhum custo de memória além do existente. Os Blocos ficam aqui e não no
//   hook comum para não segurar as outras duas abas.
// - O Mês é desta aba (`useState`): não divide a escolha com o Painel nem com as outras abas e não é guardado. Abre no Mês
//   atual.
// - Tocar num Tipo abre o Painel do Mês só com ele (`/?mes=AAAA-MM&tipo=<id>`, ou `tipo=sem`).
// - Os números das barras estão em texto na própria linha (valor e %), e o nome acessível da linha os repete: a cor e o
//   comprimento nunca são a única informação. Os alvos têm 44 pt.

function LinhaDaBarra({ barra, mes, maior }: { barra: BarraDoMeuGasto; mes: string; maior: number }) {
  const largura = barra.centavos > 0 && maior > 0 ? (barra.centavos / maior) * 100 : 0;
  const conteudo = (
    <>
      <span className="min-w-0 break-words texto-body text-text">
        {barra.nome}
        {barra.arquivado ? <span className="ml-1 texto-caption text-text-muted">({T.arquivado})</span> : null}
        {barra.natureza === "fixo" ? <span className="block texto-caption text-text-muted">{T.meu_gasto_fixo_ajuda}</span> : null}
      </span>
      <span aria-hidden className="h-3.5 overflow-hidden rounded-sm bg-background">
        {largura > 0 ? <span className="block h-full bg-accent" style={{ width: `${largura}%`, minWidth: 2 }} /> : null}
      </span>
      <span className="whitespace-nowrap text-right texto-number tabular-nums text-text">{formatarDinheiro(barra.centavos)}</span>
      <span className="text-right texto-number tabular-nums text-text-muted">{barra.percentual === null ? "—" : `${barra.percentual}%`}</span>
    </>
  );
  const grade = "grid min-h-toque grid-cols-[minmax(5rem,8rem)_minmax(0,1fr)_6.5rem_3rem] items-center gap-3 rounded-sm px-1";
  return (
    <li>
      {barra.natureza === "fixo" ? (
        <div className={grade}>{conteudo}</div>
      ) : (
        <Link
          href={enderecoDoPainelPorTipo(mes, barra.tipoId)}
          aria-label={rotuloDaBarraDoMeuGasto(barra.nome, barra.centavos, barra.percentual, mes)}
          className={`${grade} hover:bg-selection`}
        >
          {conteudo}
        </Link>
      )}
    </li>
  );
}

export function MeuGasto() {
  const { lancamentos, faturas, responsaveis, tipos, erro: erroDaPrevisao, pronto: prontoDaPrevisao, atual, tentarDeNovo } = useDadosDaPrevisao();
  const blocosLidos = useLinhas("blocos");
  const [mes, setMes] = useState(atual);

  const blocos = useMemo(() => lerBlocos(blocosLidos.linhas), [blocosLidos.linhas]);
  const mesesComFatura = useMemo(() => faturas.linhas.map((f) => f.mes), [faturas.linhas]);
  const erro = erroDaPrevisao || blocosLidos.status === "erro";
  const pronto = prontoDaPrevisao && blocosLidos.status === "pronto";

  const meuGasto = useMemo(
    () => (pronto ? projetarMeuGasto(lancamentos.linhas, { mes, blocos, tipos: tipos.linhas, mesesComFatura }) : null),
    [pronto, lancamentos.linhas, mes, blocos, tipos.linhas, mesesComFatura],
  );
  const meses = useMemo(
    () => mesesDoMeuGasto(atual, mesesComFatura, mesesComLancamentos(lancamentos.linhas), mes),
    [atual, mesesComFatura, lancamentos.linhas, mes],
  );
  const nomes = useMemo(
    () => ({
      responsaveis: new Map(responsaveis.linhas.map((r) => [r.id, r.nome])),
      tipos: new Map(tipos.linhas.map((t) => [t.id, t.nome])),
    }),
    [responsaveis.linhas, tipos.linhas],
  );
  const comFatura = useMemo(() => new Set(mesesComFatura), [mesesComFatura]);

  function tentar() {
    tentarDeNovo();
    void gerenciador("blocos").recarregar();
  }

  if (erro) return <ErroAoCarregar aoTentarDeNovo={tentar} />;
  if (!pronto || meuGasto === null) return <EsqueletoDaPrevisao texto={T.carregando_meu_gasto} />;

  if (meuGasto.estado === "sem_bloco") {
    return (
      <EstadoVazio
        texto={T.meu_gasto_sem_bloco}
        acao={
          <Botao asChild>
            <Link href={`/configuracoes?secao=${SECAO_COBRANCA}`}>{T.meu_gasto_ir_para_configuracoes}</Link>
          </Botao>
        }
      />
    );
  }

  let corpo;
  let cabecalho = null;
  if (meuGasto.estado === "sem_valor") {
    corpo = (
      <p role="status" className="texto-body text-text-muted">
        {textoMeuGastoSemValor(meuGasto.bloco.nome, meuGasto.codigo === "meu_gasto.nao_reparte")}
      </p>
    );
  } else {
    const formula = textoDaFormula(meuGasto.bloco.formula, nomes);
    cabecalho = (
      <>
        <p className="texto-caption text-text-muted">
          {rotuloDoBlocoDoMeuGasto(meuGasto.bloco.nome, formula, meuGasto.totalCentavos)}
          {meuGasto.incluiPrevistos ? ` · ${T.inclui_previstos}` : ""}
        </p>
        <p className="texto-caption text-text-muted">{T.meu_gasto_ajuda}</p>
      </>
    );
    corpo =
      meuGasto.barras.length === 0 ? (
        <p className="texto-body text-text-muted">{meuGasto.mesVazio ? T.meu_gasto_vazio : T.meu_gasto_sem_gasto}</p>
      ) : (
        <ol aria-label={T.meu_gasto_grafico} className="flex flex-col">
          {meuGasto.barras.map((b) => (
            <LinhaDaBarra key={b.chave} barra={b} mes={mes} maior={meuGasto.maiorBarraCentavos} />
          ))}
        </ol>
      );
  }

  return (
    <section aria-labelledby="meu-gasto-titulo" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="meu-gasto-titulo" className="texto-title">
            {tituloDoMeuGasto(mes)}
          </h2>
          {cabecalho}
        </div>
        <SeletorMes mes={mes} meses={meses} mesesComFatura={comFatura} aoMudar={setMes} />
      </div>
      {corpo}
    </section>
  );
}
