"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { idsQueAcompanham, separarAjustes } from "@/domain/ajustes";
import { conferir } from "@/domain/conferencia";
import { hojeEmSaoPaulo } from "@/domain/datas";
import { ehMaeDividida, filhasPorMae, linhasDaFatura, unidadesDoMes } from "@/domain/divisao";
import { lerBlocos, type BlocoParaGravar } from "@/domain/blocos";
import { textoDaFormula } from "@/domain/formula";
import { alternarSelecao, alternarTodos, selecaoValida } from "@/domain/lancamento";
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
  TEXTOS_BLOCO,
  TEXTOS_CONFERENCIA,
  TEXTOS_FILTROS,
  TEXTOS_IMPORTAR,
  TEXTOS_LANCAMENTO,
  TEXTOS_PAINEL as T,
  descricaoExcluirLancamento,
  mensagem,
  rotuloIncluidoEm,
  rotuloLancamentos,
} from "@/domain/mensagens";
import {
  ORDEM_PADRAO,
  alternarOrdem,
  distribuicaoPorResponsavel,
  resumoDoHistorico,
  ehOrdemPadrao,
  linhasDoMes,
  mesAtual,
  mesesDaLista,
  nomeExibido,
  type Ordem,
} from "@/domain/painel";
import { repoBlocos } from "@/data/blocos-repo";
import { repoFaturas } from "@/data/faturas-repo";
import { repoLancamentos, type LinhaLancamento } from "@/data/lancamentos-repo";
import { repoPlanilha } from "@/data/planilha-repo";
import { gerenciador, useLinhas } from "@/data/realtime";
import { ImportarFatura } from "@/features/importar/ImportarFatura";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { ConfirmarAcao } from "@/ui/ConfirmarAcao";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { Tela } from "@/ui/Tela";
import { useToast } from "@/ui/Toast";
import { BarraFiltros } from "./BarraFiltros";
import { CartaoBlocos } from "./CartaoBlocos";
import { FaixaConferencia } from "./FaixaConferencia";
import { FaturaDoMes } from "./FaturaDoMes";
import { GradeLancamentos, type CadastrosGrade } from "./GradeLancamentos";
import { DividirLancamento } from "./DividirLancamento";
import { MontadorBloco } from "./MontadorBloco";
import { PainelLancamento } from "./PainelLancamento";
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
//
// Painel do Lançamento (História 2.7, FR-7, FR-46, UX-DR14): tocar no corpo
// de uma linha abre o `side-panel` pela direita, sem véu; outra linha troca
// o Lançamento; ✕ ou Esc fecham. Em `lg`+ o conteúdo reserva os 400 px do
// painel. "＋ Lançamento" abre o painel vazio. "Excluir" (rodapé ou ⋯) pede
// confirmação e mostra "Excluído · Desfazer". A linha aberta fica na grade
// enquanto o painel estiver nela, mesmo que uma edição a tire do filtro
// (opção A); o total, as contagens e o anúncio seguem o filtro. A seleção
// é só estado da tela: trocar de Mês a limpa e um excluído sai dela.
//
// Ajustes de centavos (História 2.8, FR-47): o núcleo separa os Ajustes das
// mães (`separarAjustes`). Filtros, busca, "Verificar", contagens, anúncio e
// seleção olham só as mães; a grade põe cada Ajuste logo abaixo da mãe. O
// hero e a Conferência continuam com todas as linhas (o Ajuste é crédito).
// Excluir a mãe exclui os Ajustes dela na mesma gravação; "Desfazer"
// restaura todos.
//
// Fila do Revisar (História 3.2): o passo final da importação leva à tela
// Revisar ("Ir para revisão") pelo roteador.
//
// Blocos (História 4.1, FR-19): o cartão "Blocos" tem "＋ Novo bloco", que abre
// o Montador (fichas, resultado e passo a passo ao vivo sobre os Lançamentos
// do Mês aberto); a lista de Blocos lê `blocos` pelo gerenciador de Realtime.
// Os `block-card` com valor, ⋯ e 💬 são da 4.2.

const TABELAS = ["faturas", "fatura_cartoes", "lancamentos", "responsaveis", "tipos", "status"] as const;

type EstadoPainel = { modo: "editar"; id: string } | { modo: "novo" } | null;

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

function BotaoNovoLancamento({ aoIncluir, pronto }: { aoIncluir: () => void; pronto: boolean }) {
  return (
    <Botao aria-label={TEXTOS_LANCAMENTO.rotulo_novo} disabled={!pronto} onClick={aoIncluir}>
      <span aria-hidden>＋</span>
      {TEXTOS_LANCAMENTO.botao_novo}
    </Botao>
  );
}

/** Esc fecha o painel, menos quando uma janela, um menu ou um popover está por cima. */
function sobreposicaoAberta(): boolean {
  return document.querySelector('[role="alertdialog"], [role="dialog"], [role="menu"]') !== null;
}

export function Painel({ titulo }: { titulo: string }) {
  // O relógio fica fora do núcleo: "hoje" é lido aqui, uma vez.
  const [atual] = useState(() => mesAtual(hojeEmSaoPaulo(new Date())));
  const [mesAberto, setMesAberto] = useState(atual);
  const mesAbertoRef = useRef(mesAberto);
  useEffect(() => {
    mesAbertoRef.current = mesAberto;
  }, [mesAberto]);
  const [filtros, setFiltros] = useState<FiltrosGrade>(FILTROS_VAZIOS);
  const [ordem, setOrdem] = useState<Ordem>(ORDEM_PADRAO);
  const [importando, setImportando] = useState(false);
  // O anúncio de "N lançamentos" só depois que os filtros mudam a grade.
  const [anunciar, setAnunciar] = useState(false);
  const [painel, setPainel] = useState<EstadoPainel>(null);
  const [selecao, setSelecao] = useState<ReadonlySet<string>>(() => new Set());
  const [excluindo, setExcluindo] = useState<string | null>(null);
  // A mãe cuja janela "Dividir" está aberta (História 3.8).
  const [dividindo, setDividindo] = useState<string | null>(null);
  // O Montador de Bloco está aberto (História 4.1).
  const [montando, setMontando] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const faturas = useLinhas("faturas");
  const cartoes = useLinhas("fatura_cartoes");
  const lancamentos = useLinhas("lancamentos");
  const responsaveis = useLinhas("responsaveis");
  const tipos = useLinhas("tipos");
  const status = useLinhas("status");
  const ciclo = useLinhas("config_ciclo");
  const configuracoes = useLinhas("configuracoes");
  const blocosLidos = useLinhas("blocos");
  // Para o "Desfazer" do "Desvincular" ler a classificação atual da mãe.
  const linhasRef = useRef(lancamentos.linhas);
  useEffect(() => {
    linhasRef.current = lancamentos.linhas;
  }, [lancamentos.linhas]);
  const lerLinha = useCallback((id: string) => linhasRef.current.find((l) => l.id === id), []);

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
  // Os nomes para escrever a Fórmula dos Blocos (com os arquivados: uma Fórmula antiga ainda os cita).
  const nomesDaFormula = useMemo(
    () => ({
      responsaveis: new Map(responsaveis.linhas.map((r) => [r.id, r.nome])),
      tipos: new Map(tipos.linhas.map((t) => [t.id, t.nome])),
    }),
    [responsaveis.linhas, tipos.linhas],
  );
  const ordemResponsaveis = useMemo(
    () => [...responsaveis.linhas].sort((a, b) => a.ordem - b.ordem).map((r) => r.id),
    [responsaveis.linhas],
  );

  const mesesComFatura = useMemo(() => new Set(faturas.linhas.map((f) => f.mes)), [faturas.linhas]);
  // Meses com histórico importado da planilha (3.10) também entram no seletor.
  const [mesesComHistorico, setMesesComHistorico] = useState<string[]>([]);
  useEffect(() => {
    let vivo = true;
    void repoPlanilha()
      .mesesComHistorico()
      .then((r) => {
        if (vivo && r.ok) setMesesComHistorico(r.meses.map((m) => m.mes));
      });
    return () => {
      vivo = false;
    };
  }, []);
  const meses = mesesDaLista([...mesesComFatura, ...mesesComHistorico], atual, mesAberto);
  const fatura = faturas.linhas.find((f) => f.mes === mesAberto) ?? null;

  const retratos = [faturas, cartoes, lancamentos, responsaveis, tipos, status];
  const erro = retratos.some((r) => r.status === "erro");
  // A memória ainda é de outro Mês até o gerenciador abrir este.
  const carregando =
    retratos.some((r) => r.status === "carregando") || (lancamentos.mes !== undefined && lancamentos.mes !== mesAberto);

  const blocos = useMemo(() => lerBlocos(blocosLidos.linhas), [blocosLidos.linhas]);

  async function salvarBloco(pedido: BlocoParaGravar): Promise<boolean> {
    const r = await repoBlocos().salvar(pedido);
    toast.mostrar({ texto: r.ok ? TEXTOS_BLOCO.salvo : mensagem(r.codigo) });
    return r.ok;
  }

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
    // A seleção e o painel são do Mês.
    setSelecao(new Set());
    setPainel(null);
    setDividindo(null);
  };

  // Esc fecha o painel (a janela de confirmação, os menus e os popovers fecham antes).
  const painelAberto = painel !== null;
  useEffect(() => {
    if (!painelAberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || sobreposicaoAberta()) return;
      setPainel(null);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [painelAberto]);

  // O Lançamento aberto (com os excluídos: a memória guarda o Mês inteiro).
  const aberta =
    painel?.modo === "editar" ? lancamentos.linhas.find((l) => l.id === painel.id && l.mes === mesAberto) : undefined;
  // Excluído (ou apagado) em outro aparelho: o painel fecha. A exclusão feita
  // aqui fecha o painel antes de gravar, então nunca cai aqui.
  const excluidaFora =
    painel?.modo === "editar" && !carregando && !erro && (aberta === undefined || aberta.excluido_em !== null);
  const [excluidasFora, setExcluidasFora] = useState(0);
  if (excluidaFora) {
    // Ajuste durante a renderização: fecha já e conta o aviso para o efeito.
    setPainel(null);
    setExcluidasFora((n) => n + 1);
  }
  useEffect(() => {
    if (excluidasFora > 0) toast.mostrar({ texto: TEXTOS_LANCAMENTO.excluido_em_outro_aparelho });
  }, [excluidasFora, toast]);

  function aoIncluido(linha: LinhaLancamento) {
    // O Mês aberto de agora (a gravação pode ter terminado depois de trocar de Mês).
    if (linha.mes === mesAbertoRef.current) {
      setPainel({ modo: "editar", id: linha.id });
      return;
    }
    setPainel(null);
    toast.mostrar({ texto: rotuloIncluidoEm(linha.mes) });
  }

  /** Os Ajustes não excluídos da linha `id` no Mês aberto (saem e voltam com ela). */
  const ajustesDe = (id: string) => idsQueAcompanham(id, lancamentos.linhas.filter((l) => l.mes === mesAberto));
  /** As filhas não excluídas de uma mãe dividida (saem e voltam com ela, como os Ajustes). */
  const filhasDe = (id: string) =>
    lancamentos.linhas.filter((l) => l.mes === mesAberto && l.dividido_de_id === id && l.excluido_em === null).map((l) => l.id);

  async function excluir(id: string) {
    const junto = [...ajustesDe(id), ...filhasDe(id)];
    // Fecha antes de gravar: a linha (e os Ajustes dela) sai do painel e da seleção.
    setPainel((p) => (p?.modo === "editar" && (p.id === id || junto.includes(p.id)) ? null : p));
    setSelecao((s) => {
      const nova = new Set(s);
      nova.delete(id);
      return nova;
    });
    const r = junto.length > 0 ? await repoLancamentos().excluir(id, { junto }) : await repoLancamentos().excluir(id);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return;
    }
    toast.mostrar({
      texto: TEXTOS_LANCAMENTO.excluido,
      aoDesfazer: () => {
        void (junto.length > 0 ? repoLancamentos().restaurar(id, { junto }) : repoLancamentos().restaurar(id))
          .then((d) => {
            if (!d.ok) toast.mostrar({ texto: mensagem(d.codigo) });
          });
      },
    });
  }

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
  let painelLateral = null;
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
    const doMes = linhasDoMes(lancamentos.linhas, mesAberto);
    // Conferência, "Total a pagar" e "verificar" usam a mãe; as filhas de uma Divisão não entram (História 3.8).
    const daFatura = fatura ? linhasDaFatura(doMes).filter((l) => l.fatura_id === fatura.id) : [];
    const conferencia = fatura ? conferir(fatura, cartoes.linhas, doMes) : null;
    // Soma, filtros, contagens, anúncio e seleção olham as unidades: a mãe dividida fica de fora e valem
    // as filhas (a mãe aparece só como cabeçalho). O Ajuste segue a mãe dele.
    const unidades = unidadesDoMes(doMes);
    // Mês sem Fatura mas com histórico da planilha (3.10): o hero mostra o total dessas linhas.
    const historico = fatura ? null : resumoDoHistorico(doMes);
    const maesDivididas = new Map(doMes.filter(ehMaeDividida).map((l) => [l.id, l]));
    const { maes, ajustesPorMae } = separarAjustes(unidades);
    // Sem Fatura não há o que verificar (nem a pílula): o filtro fica guardado.
    const verificando = filtros.verificar && conferencia !== null;
    const efetivos = { ...filtros, verificar: verificando };
    const naGrade = aplicarFiltros(maes, filtros, conferencia);
    const cadastrosFiltro = { responsaveis: responsaveis.linhas, tipos: tipos.linhas, status: status.linhas };
    const listar = (c: ColunaFiltro, extras: readonly (string | null)[] = []) =>
      valoresDaColuna(c, maes, filtros, conferencia, cadastrosFiltro, extras);
    const opcoes = Object.fromEntries(COLUNAS_DA_BARRA.map((c) => [c, listar(c)])) as Record<ColunaFiltro, OpcaoFiltro[]>;
    const abertaNoMes = aberta && aberta.excluido_em === null ? aberta : null;
    // A mãe do Ajuste aberto (se ele é Ajuste de uma linha do Mês).
    const maeDaAberta =
      abertaNoMes?.ajuste_de_id && ajustesPorMae.get(abertaNoMes.ajuste_de_id)?.some((a) => a.id === abertaNoMes.id)
        ? (doMes.find((l) => l.id === abertaNoMes.ajuste_de_id) ?? null)
        : null;
    // A linha aberta que uma edição tirou do filtro continua na grade (opção A);
    // num Ajuste, fica a mãe (com ele embaixo).
    const linhaFixa = ehMaeDividida(abertaNoMes ?? {}) ? null : (maeDaAberta ?? abertaNoMes);
    const idsDoMes = maes.map((l) => l.id);
    const selecionados = selecaoValida(selecao, idsDoMes);
    const idsNaGrade = naGrade.map((l) => l.id);
    const cartoesDaFatura = fatura
      ? cartoes.linhas
          .filter((c) => c.fatura_id === fatura.id)
          .map((c) => c.final)
          .sort()
      : [];
    const cadastrosPainel = { responsaveis: responsaveis.linhas, tipos: tipos.linhas, status: status.linhas };
    if (painel?.modo === "novo") {
      painelLateral = (
        <PainelLancamento
          modo="novo"
          mesAberto={mesAberto}
          fatura={fatura}
          cartoes={cartoesDaFatura}
          configsCiclo={ciclo.linhas}
          statusPadraoId={configuracoes.linhas[0]?.status_padrao_id ?? null}
          cadastros={cadastrosPainel}
          aoFechar={() => setPainel(null)}
          aoIncluido={aoIncluido}
        />
      );
    } else if (abertaNoMes) {
      painelLateral = (
        <PainelLancamento
          key={abertaNoMes.id}
          modo="editar"
          linha={abertaNoMes}
          mae={maeDaAberta}
          ajustes={maeDaAberta ? [] : (ajustesPorMae.get(abertaNoMes.id) ?? [])}
          filhas={filhasPorMae(doMes).get(abertaNoMes.id) ?? []}
          maeDaParte={abertaNoMes.dividido_de_id ? (doMes.find((l) => l.id === abertaNoMes.dividido_de_id) ?? null) : null}
          aoDividir={setDividindo}
          lerLinha={lerLinha}
          conferencia={conferencia}
          cadastros={cadastrosPainel}
          aoFechar={() => setPainel(null)}
          aoExcluir={setExcluindo}
        />
      );
    }
    const mostrarFaixa = fatura !== null && conferencia !== null && !conferencia.conferido && fatura.alerta_dispensado_em === null;
    const motivo = motivoDoVazio(efetivos, doMes.length > 0);
    conteudo = (
      <div className="flex flex-col gap-3">
        {/* iPad deitado e PC: o cartão da fatura ocupa 40% e os Blocos o resto; em pé, a largura toda. */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <div className="w-full lg:w-2/5">
            <FaturaDoMes
              mes={mesAberto}
              fatura={fatura}
              valoresDaFaturaCentavos={daFatura.map((l) => l.valor_centavos)}
              distribuicao={distribuicaoPorResponsavel(unidades, ordemResponsaveis)}
              responsaveis={cadastros.responsaveis}
              escolhidos={filtros.colunas.responsavel}
              aoFiltrar={filtrar}
              aoImportar={abrirImportar}
              conferencia={conferencia}
              aoVerificar={ligarVerificar}
              historico={historico}
            />
          </div>
          <div className="w-full lg:w-3/5">
            <CartaoBlocos
              itens={blocos.map((b) => ({ id: b.id, nome: b.nome, formula: textoDaFormula(b.formula, nomesDaFormula) }))}
              pronto={blocosLidos.status === "pronto"}
              aoNovo={() => setMontando(true)}
            />
          </div>
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
          listar={listar}
          comVerificar={conferencia !== null}
          mostrarLimpar={temFiltro(efetivos) || !ehOrdemPadrao(ordem)}
          aoLimparTudo={limparTudo}
        />
        <p role="status" className="sr-only">
          {anunciar ? rotuloLancamentos(naGrade.length) : ""}
        </p>
        <GradeLancamentos
          linhas={naGrade}
          ajustesPorMae={ajustesPorMae}
          maesDivididas={maesDivididas}
          aoDividir={setDividindo}
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
          selecao={selecionados}
          aoSelecionar={(id) => setSelecao((s) => alternarSelecao(selecaoValida(s, idsDoMes), id))}
          aoSelecionarTodos={() => setSelecao((s) => alternarTodos(selecaoValida(s, idsDoMes), idsNaGrade))}
          abertoId={abertaNoMes?.id ?? null}
          aoAbrir={(id) => setPainel({ modo: "editar", id })}
          aoExcluir={setExcluindo}
          linhaFixa={linhaFixa}
        />
      </div>
    );
  }

  const aExcluir = excluindo === null ? undefined : lancamentos.linhas.find((l) => l.id === excluindo);

  return (
    // iPad deitado e PC: o conteúdo reserva a largura do painel lateral.
    <div className={cn(painelLateral !== null && "lg:pr-painel-lateral")}>
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
            {/* Só com o Ciclo (Mês pela data) e o Status padrão carregados. */}
            <BotaoNovoLancamento
              aoIncluir={() => setPainel({ modo: "novo" })}
              pronto={ciclo.status === "pronto" && configuracoes.status === "pronto"}
            />
            <BotaoImportar aoImportar={abrirImportar} />
          </>
        }
      >
        {conteudo}
        {painelLateral}
        <ConfirmarAcao
          aberta={aExcluir !== undefined}
          aoMudar={(abrir) => {
            if (!abrir) setExcluindo(null);
          }}
          titulo={TEXTOS_LANCAMENTO.confirmar_excluir_titulo}
          descricao={
            aExcluir
              ? descricaoExcluirLancamento(nomeExibido(aExcluir), aExcluir.fatura_id !== null, ajustesDe(aExcluir.id).length)
              : ""
          }
          rotuloConfirmar={TEXTOS_LANCAMENTO.confirmar_excluir}
          aoConfirmar={() => {
            if (excluindo !== null) void excluir(excluindo);
            setExcluindo(null);
          }}
        />
        <DividirLancamento
          alvoId={dividindo}
          aoFechar={() => setDividindo(null)}
          linhas={lancamentos.linhas}
          cadastros={{ responsaveis: responsaveis.linhas, status: status.linhas }}
          statusPadraoId={configuracoes.linhas[0]?.status_padrao_id ?? null}
        />
        {montando && !erro && !carregando ? (
          <MontadorBloco
            aberta
            aoMudar={setMontando}
            linhas={lancamentos.linhas}
            mes={mesAberto}
            responsaveis={responsaveis.linhas}
            tipos={tipos.linhas}
            blocos={blocos}
            aoSalvar={salvarBloco}
          />
        ) : null}
        <ImportarFatura
          aberta={importando}
          aoMudar={setImportando}
          aoImportar={mudarMes}
          aoIrParaRevisao={() => router.push("/revisar")}
        />
      </Tela>
    </div>
  );
}
