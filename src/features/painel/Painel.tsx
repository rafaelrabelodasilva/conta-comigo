"use client";

import { useEffect, useMemo, useState } from "react";
import { conferir } from "@/domain/conferencia";
import { hojeEmSaoPaulo } from "@/domain/datas";
import {
  COLUNAS_DA_BARRA,
  FILTROS_VAZIOS,
  alternarResponsavelUnico,
  aplicarFiltros,
  motivoDoVazio,
  temFiltro,
  valoresDaColuna,
  type ColunaFiltro,
  type FiltrosGrade,
  type OpcaoFiltro,
} from "@/domain/filtros-grade";
import {
  TEXTOS_CONFERENCIA,
  TEXTOS_FILTROS,
  TEXTOS_IMPORTAR,
  TEXTOS_PAINEL as T,
  mensagem,
  rotuloLancamentos,
} from "@/domain/mensagens";
import {
  ORDEM_PADRAO,
  alternarOrdem,
  distribuicaoPorResponsavel,
  ehOrdemPadrao,
  mesAtual,
  mesesDaLista,
  type Ordem,
} from "@/domain/painel";
import { repoFaturas } from "@/data/faturas-repo";
import { gerenciador, useLinhas } from "@/data/realtime";
import { ImportarFatura } from "@/features/importar/ImportarFatura";
import { Botao } from "@/ui/Botao";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { Tela } from "@/ui/Tela";
import { useToast } from "@/ui/Toast";
import { BarraFiltros } from "./BarraFiltros";
import { FaixaConferencia } from "./FaixaConferencia";
import { FaturaDoMes } from "./FaturaDoMes";
import { GradeLancamentos, type CadastrosGrade } from "./GradeLancamentos";
import { SeletorMes } from "./SeletorMes";

// Painel do Mês (História 2.4, FR-21, FR-22): um Mês só, o Mês aberto, que
// começa sempre no Mês atual (calendário de hoje em São Paulo). O
// `month-switcher` troca o Mês; o `invoice-hero` mostra a Fatura dele e a
// barra por Responsável; a grade mostra os Lançamentos do Mês. O
// gerenciador de `lancamentos` guarda só o Mês aberto (AD-4): trocar de Mês
// mostra o esqueleto enquanto ele relê. Depois de importar, o Painel abre o
// Mês importado.
//
// Conferência (História 2.5, FR-6): o núcleo confere a Fatura do Mês com os
// cartões lidos (`fatura_cartoes`) e os Lançamentos dela (`conferir`); o
// hero mostra o selo, a faixa âmbar avisa a diferença (até bater ou ser
// dispensada) e a pílula "Verificar" mostra só as linhas marcadas. Tudo
// derivado; só "Dispensar" grava.
//
// Barra de filtros (História 2.6, FR-21): busca, pílulas por coluna,
// "Verificar" e "Limpar filtros" (`BarraFiltros`); o estado é
// `FiltrosGrade` e as regras são do núcleo (`filtros-grade.ts`). Nada é
// gravado. Trocar de Mês mantém busca, filtros, "Verificar" e ordem. A barra
// do hero e a `person-tag` escrevem na coluna Responsável. Um `role=status`
// oculto anuncia "N lançamentos" quando os filtros mudam a grade.

const TABELAS = ["faturas", "fatura_cartoes", "lancamentos", "responsaveis", "tipos", "status"] as const;

function EsqueletoPainel() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{T.carregando}</span>
      <Esqueleto className="h-40 w-full lg:w-2/5" />
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <Esqueleto className="h-6" />
        {Array.from({ length: 8 }, (_, i) => (
          <Esqueleto key={i} className="h-8" />
        ))}
      </div>
    </div>
  );
}

function BotaoImportar({ aoImportar }: { aoImportar: () => void }) {
  return (
    <Botao variante="primario" onClick={aoImportar}>
      <span aria-hidden>＋</span>
      {TEXTOS_IMPORTAR.botao}
    </Botao>
  );
}

export function Painel({ titulo }: { titulo: string }) {
  // O relógio fica fora do núcleo: "hoje" é lido aqui, uma vez.
  const [atual] = useState(() => mesAtual(hojeEmSaoPaulo(new Date())));
  const [mesAberto, setMesAberto] = useState(atual);
  const [filtros, setFiltros] = useState<FiltrosGrade>(FILTROS_VAZIOS);
  const [ordem, setOrdem] = useState<Ordem>(ORDEM_PADRAO);
  const [importando, setImportando] = useState(false);
  // O anúncio de "N lançamentos" só depois que os filtros mudam a grade.
  const [anunciar, setAnunciar] = useState(false);
  const toast = useToast();

  const faturas = useLinhas("faturas");
  const cartoes = useLinhas("fatura_cartoes");
  const lancamentos = useLinhas("lancamentos");
  const responsaveis = useLinhas("responsaveis");
  const tipos = useLinhas("tipos");
  const status = useLinhas("status");

  // A memória de `lancamentos` acompanha o Mês aberto.
  useEffect(() => {
    gerenciador("lancamentos").abrirMes(mesAberto);
  }, [mesAberto]);

  const cadastros = useMemo<CadastrosGrade>(
    () => ({
      tipos: new Map(tipos.linhas.map((t) => [t.id, t.nome])),
      responsaveis: new Map(responsaveis.linhas.map((r) => [r.id, { nome: r.nome, cor: r.cor }])),
      status: new Map(status.linhas.map((s) => [s.id, { nome: s.nome, conta_como_pago: s.conta_como_pago }])),
    }),
    [tipos.linhas, responsaveis.linhas, status.linhas],
  );
  const ordemResponsaveis = useMemo(
    () => [...responsaveis.linhas].sort((a, b) => a.ordem - b.ordem).map((r) => r.id),
    [responsaveis.linhas],
  );

  const mesesComFatura = useMemo(() => new Set(faturas.linhas.map((f) => f.mes)), [faturas.linhas]);
  const meses = mesesDaLista([...mesesComFatura], atual, mesAberto);
  const fatura = faturas.linhas.find((f) => f.mes === mesAberto) ?? null;

  const retratos = [faturas, cartoes, lancamentos, responsaveis, tipos, status];
  const erro = retratos.some((r) => r.status === "erro");
  // A memória ainda é de outro Mês até o gerenciador abrir este.
  const carregando =
    retratos.some((r) => r.status === "carregando") || (lancamentos.mes !== undefined && lancamentos.mes !== mesAberto);

  const abrirImportar = () => setImportando(true);
  const mudarFiltros = (atualizar: (f: FiltrosGrade) => FiltrosGrade) => {
    setFiltros(atualizar);
    setAnunciar(true);
  };
  const filtrar = (id: string | null) => mudarFiltros((f) => alternarResponsavelUnico(f, id));
  // O selo e "Ver lançamentos" ligam "Verificar" sem mexer nos outros filtros.
  const ligarVerificar = () => mudarFiltros((f) => ({ ...f, verificar: true }));
  const limparTudo = () => {
    mudarFiltros(() => FILTROS_VAZIOS);
    setOrdem(ORDEM_PADRAO);
  };
  const mudarMes = (mes: string) => {
    setMesAberto(mes);
    setAnunciar(false);
  };

  async function dispensar(faturaId: string) {
    const r = await repoFaturas().dispensarAlerta(faturaId);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return;
    }
    toast.mostrar({
      texto: TEXTOS_CONFERENCIA.alerta_dispensado,
      aoDesfazer: () => {
        void repoFaturas()
          .desfazerDispensa(faturaId)
          .then((d) => {
            if (!d.ok) toast.mostrar({ texto: mensagem(d.codigo) });
          });
      },
    });
  }

  let conteudo;
  if (erro) {
    conteudo = (
      <ErroAoCarregar
        aoTentarDeNovo={() => {
          for (const t of TABELAS) void gerenciador(t).recarregar();
        }}
      />
    );
  } else if (carregando) {
    conteudo = <EsqueletoPainel />;
  } else {
    const doMes = lancamentos.linhas.filter((l) => l.mes === mesAberto && l.excluido_em === null);
    const daFatura = fatura ? doMes.filter((l) => l.fatura_id === fatura.id) : [];
    const conferencia = fatura ? conferir(fatura, cartoes.linhas, doMes) : null;
    // Sem Fatura não há o que verificar (nem a pílula): o filtro fica guardado.
    const verificando = filtros.verificar && conferencia !== null;
    const efetivos = { ...filtros, verificar: verificando };
    const naGrade = aplicarFiltros(doMes, filtros, conferencia);
    const opcoes = Object.fromEntries(
      COLUNAS_DA_BARRA.map((c) => [
        c,
        valoresDaColuna(c, doMes, filtros, conferencia, {
          responsaveis: responsaveis.linhas,
          tipos: tipos.linhas,
          status: status.linhas,
        }),
      ]),
    ) as Record<ColunaFiltro, OpcaoFiltro[]>;
    const mostrarFaixa = fatura !== null && conferencia !== null && !conferencia.conferido && fatura.alerta_dispensado_em === null;
    const motivo = motivoDoVazio(efetivos, doMes.length > 0);
    conteudo = (
      <div className="flex flex-col gap-3">
        {/* iPad deitado e PC: o cartão da fatura ocupa 40% (os Blocos virão ao lado); em pé, a largura toda. */}
        <div className="w-full lg:w-2/5">
          <FaturaDoMes
            mes={mesAberto}
            fatura={fatura}
            valoresDaFaturaCentavos={daFatura.map((l) => l.valor_centavos)}
            distribuicao={distribuicaoPorResponsavel(doMes, ordemResponsaveis)}
            responsaveis={cadastros.responsaveis}
            escolhidos={filtros.colunas.responsavel}
            aoFiltrar={filtrar}
            aoImportar={abrirImportar}
            conferencia={conferencia}
            aoVerificar={ligarVerificar}
          />
        </div>
        {mostrarFaixa ? (
          <FaixaConferencia
            conferencia={conferencia}
            aoVerLancamentos={ligarVerificar}
            aoDispensar={() => void dispensar(fatura.id)}
          />
        ) : null}
        <BarraFiltros
          filtros={filtros}
          aoMudar={mudarFiltros}
          opcoes={opcoes}
          comVerificar={conferencia !== null}
          mostrarLimpar={temFiltro(efetivos) || !ehOrdemPadrao(ordem)}
          aoLimparTudo={limparTudo}
        />
        <p role="status" className="sr-only">
          {anunciar ? rotuloLancamentos(naGrade.length) : ""}
        </p>
        <GradeLancamentos
          linhas={naGrade}
          cadastros={cadastros}
          ordem={ordem}
          aoOrdenar={(coluna) => setOrdem((o) => alternarOrdem(o, coluna))}
          escolhidos={filtros.colunas.responsavel}
          aoFiltrar={filtrar}
          conferencia={conferencia}
          verificando={verificando}
          vazio={
            motivo === "filtros"
              ? TEXTOS_FILTROS.sem_resultado
              : motivo === "verificar"
                ? TEXTOS_CONFERENCIA.sem_para_verificar
                : faturas.linhas.length === 0
                  ? mensagem("painel.vazio")
                  : T.sem_lancamentos
          }
          aoLimparFiltros={motivo === null ? undefined : limparTudo}
        />
      </div>
    );
  }

  return (
    <Tela
      titulo={titulo}
      acoes={
        <>
          <SeletorMes
            mes={mesAberto}
            meses={meses}
            mesesComFatura={faturas.status === "pronto" ? mesesComFatura : new Set()}
            aoMudar={mudarMes}
          />
          <BotaoImportar aoImportar={abrirImportar} />
        </>
      }
    >
      {conteudo}
      <ImportarFatura aberta={importando} aoMudar={setImportando} aoImportar={mudarMes} />
    </Tela>
  );
}
