"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { idsQueAcompanham, separarAjustes } from "@/domain/ajustes";
import { lerBlocos } from "@/domain/blocos";
import { conferir } from "@/domain/conferencia";
import { TOLERANCIA_ATRASO_PADRAO_DIAS } from "@/domain/configuracoes";
import { hojeEmSaoPaulo } from "@/domain/datas";
import { planejarDesligar, planejarProgramacao, programadaDe } from "@/domain/divida";
import { ehMaeDividida, filhasPorMae, linhasDaFatura, unidadesDoMes } from "@/domain/divisao";
import { atrasosDasLinhas } from "@/domain/atraso";
import { alternarSelecao, alternarTodos, selecaoValida } from "@/domain/lancamento";
import { parcelasDoLote, type CamposDoLote } from "@/domain/lote";
import {
  COLUNAS_DA_BARRA,
  FILTROS_VAZIOS,
  alternarBloco,
  alternarResponsavelUnico,
  aplicarFiltros,
  limparBloco,
  motivoDoVazio,
  motivoParaDesfazerBloco,
  resolverBloco,
  restringirAoBloco,
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
  TEXTOS_SELECAO,
  descricaoExcluirEmLote,
  descricaoExcluirLancamento,
  mensagem,
  mensagemDoPagamento,
  rotuloDesprogramados,
  rotuloIncluidoEm,
  rotuloLancamentos,
  rotuloLancamentosClassificados,
  rotuloLancamentosExcluidos,
  rotuloLancamentosPagos,
  rotuloPagamentoParcial,
  rotuloProgramados,
  rotuloStatusAplicado,
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
import { mensagemDaSelecao } from "@/domain/mensagem-janela";
import { lerModelo } from "@/domain/modelo-mensagem";
import { faltaDoParcial, idsComPagamento, idsQuitadosPorPagamento, projetarPagamento, recusarStatusNaoPago, somaDosItens } from "@/domain/pagamento";
import { TEXTOS_AVISO_PAGAMENTO } from "@/domain/mensagens";
import { pendentesDosLancamentos, projetarPainel } from "@/domain/projecoes";
import { faltaReceberDoMes, recebidoNoMes } from "@/domain/recebimentos";
import { ativos as responsaveisAtivos } from "@/domain/responsaveis";
import {
  aoTrocarDeMes,
  planejarClassificacaoEmLote,
  planejarExclusaoEmLote,
  contarPartes,
  resumoDaSelecao,
  selecionarTudo,
} from "@/domain/selecao";
import { ativos as statusAtivos } from "@/domain/status";
import { ativos as tiposAtivos } from "@/domain/tipos";
import { useConexao } from "@/data/conexao";
import { configuracoesDoDono } from "@/data/configuracoes-repo";
import { repoFaturas } from "@/data/faturas-repo";
import { repoLancamentos, type LinhaLancamento } from "@/data/lancamentos-repo";
import { repoPagamentos } from "@/data/pagamentos-repo";
import { repoPlanilha } from "@/data/planilha-repo";
import { gerenciador, useLinhas } from "@/data/realtime";
import { SECAO_MODELO_DA_MENSAGEM } from "@/features/configuracoes/secoes";
import { ImportarFatura } from "@/features/importar/ImportarFatura";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { ConfirmarAcao } from "@/ui/ConfirmarAcao";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { Tela } from "@/ui/Tela";
import { useToast } from "@/ui/Toast";
import { useHoje } from "@/ui/use-hoje";
import { AtalhoSelecionarTodos } from "./AtalhoSelecionarTodos";
import { BarraFiltros } from "./BarraFiltros";
import { BarraSelecaoPainel } from "./BarraSelecaoPainel";
import { BlocosDoMes } from "./BlocosDoMes";
import { FaixaConferencia } from "./FaixaConferencia";
import { FaturaDoMes } from "./FaturaDoMes";
import { GradeLancamentos, type CadastrosGrade } from "./GradeLancamentos";
import { JanelaAplicarStatus, type EscolhaAplicada, type ResultadoAplicar } from "./JanelaAplicarStatus";
import { JanelaClassificarEmLote } from "./JanelaClassificarEmLote";
import { JanelaGerarMensagem } from "./JanelaGerarMensagem";
import { JanelaMensagemDoBloco } from "./JanelaMensagemDoBloco";
import { JanelaProgramarDivida } from "./JanelaProgramarDivida";
import { DividirLancamento } from "./DividirLancamento";
import { ConfirmarComPagamento, type ContextoDoAviso } from "./ConfirmarComPagamento";
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
// Blocos (Histórias 4.1 e 4.2, FR-19): o cartão "Blocos" (`BlocosDoMes`) mostra
// cada Bloco como `block-card`, com o valor da Fórmula sobre os Lançamentos do
// Mês aberto (`projetarPainel`), e liga o Montador, "Ver cálculo", Reordenar e
// Excluir. Os valores mudam no lugar quando um Lançamento muda em qualquer
// aparelho. `blocos` não segura o Painel: se a leitura falha, só o cartão avisa
// (com "Tentar de novo"); o "Tentar de novo" do Painel também a relê. A barra
// por Responsável do hero, como os Blocos, soma todos os Lançamentos do Mês,
// previstos incluídos (decisão da 4.2): "Todos" e a soma das barras batem.
//
// Filtrar pelo Bloco (História 4.3, FR-20): tocar num `block-card` filtra a grade
// pelos Lançamentos que `avaliar` diz que entram (`filtros.bloco` guarda só o id;
// `resolverBloco` calcula quem entra a cada render, também no Mês novo). Soma-se
// (E) à busca, às colunas e a "Verificar"; a pílula "Bloco: Nome ✕" e "Limpar
// filtros" o desfazem. O hero e a Conferência seguem o Mês todo. Um Bloco excluído
// em outro aparelho desfaz o filtro e avisa.
//
// Selecionar e ver o total (História 4.4, FR-48, UX-DR11, UX-DR12): a Seleção é um
// conjunto de ids de um Mês só e sempre um subconjunto do que a grade mostra com os
// filtros de agora (o que sai do filtro, ou é excluído em outro aparelho, sai dela).
// A caixa do cabeçalho e ⌘/Ctrl+A (`AtalhoSelecionarTodos`) marcam todos do filtro, também
// os que rolam para fora da vista. Com 1+ marcada aparece a `selection-bar`
// (`BarraSelecaoPainel`): "N selecionados · R$ total" (o texto e o total vêm do núcleo,
// `resumoDaSelecao`, a mesma soma líquida do Revisar e do rodapé), "Limpar", "⋯ Mais"
// (Classificar em lote, pela função da 3.3, e Excluir, com os Ajustes `junto`) e
// "Gerar mensagem" (4.6: abre `JanelaGerarMensagem`, que mostra a mensagem pronta do núcleo
// (`mensagemDaSelecao`: a Seleção, o Mês, os Status e o modelo) e acompanha o Realtime). O 💬
// do Bloco (4.7) abre a mesma janela pela `JanelaMensagemDoBloco` (a forma 2). A região `role=status` que anuncia o total
// fica no DOM, vazia, antes da primeira marcação. Trocar de Mês limpa a Seleção e avisa
// só se havia Seleção (`aoTrocarDeMes`).
//
// Marcar como pago (História 6.1, FR-25, UX-DR18): "Aplicar status" na barra abre
// `JanelaAplicarStatus`. Com um Status que conta como pago, o núcleo (`projetarPagamento`,
// `planejarPagamento`) diz o que a Seleção quita e monta o pedido; `repoPagamentos().aplicar`
// grava o Pagamento, os itens e o Status das linhas numa RPC, e aparece "N lançamentos marcados
// como pagos · Desfazer". Com um Status que não conta como pago, só o Status muda (a função de
// lote da 3.3, sem Pagamento). Aplicar à mão um Status "não pago" numa linha com Pagamento é
// recusado (AD-10): o lote e o painel do Lançamento conferem o núcleo antes de gravar. Os itens
// de Pagamento do Mês aberto vêm do Realtime (`pagamento_itens`, que guarda o `mes`) e, como
// `blocos`, não seguram o Painel: se a leitura falha, só "Aplicar status" com Pagamento espera.
//
// Atrasado (História 6.4, FR-49): `atrasosDasLinhas` (núcleo) diz quais Lançamentos do Mês aberto
// passaram do vencimento + a tolerância (`configuracoes.tolerancia_atraso_dias`) sem estar pagos. O
// "hoje" vem de um só ponto (`useHoje`, America/Sao_Paulo, atualizado quando o dia vira com a tela
// aberta). A grade e o painel do Lançamento mostram o selo "Atrasado" e o filtro de Status ganha o
// valor "Atrasado" (`FILTRO_ATRASADO`). Só calcula com o Ciclo, as configurações, as Faturas e os itens de
// Pagamento do Mês lidos (antes, ninguém aparece atrasado, em vez de aparecer com a regra errada).
// Nada é gravado.
//
// Recebimentos no hero (História 6.5, FR-26): "Recebido no mês" soma o valor recebido dos Pagamentos com data no
// Mês (`recebidoNoMes`, o gerenciador de `pagamentos` de todos os Meses) e "Falta receber" soma os Blocos de
// cobrança sobre o que está em aberto no Mês aberto (`pendentesDosLancamentos` com `mes`, e `faltaReceberDoMes`:
// `avaliar` do núcleo). Tocar em "Falta receber" abre Recebimentos. Sem os itens de Pagamento, os Blocos ou os
// Pagamentos lidos, o valor é "—" (nunca um número com a regra errada).

/** Qualquer valor não nulo: o aviso só precisa saber que a linha sai (o relógio não entra no núcleo). */
const EXCLUIDO_PARA_O_AVISO = "excluido";

const TABELAS = ["faturas", "fatura_cartoes", "lancamentos", "responsaveis", "tipos", "status", "blocos", "pagamento_itens", "pagamentos"] as const;

/** Sem ninguém atrasado: os dados do Atrasado (Ciclo, configurações, Faturas e itens de Pagamento) ainda não chegaram. */
const SEM_ATRASO: ReadonlyMap<string, string> = new Map();

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

export function Painel({
  titulo,
  mesInicial,
  lancamentoInicial,
}: {
  titulo: string;
  /**
   * O Mês que abre (`AAAA-MM`), em vez do atual: "A receber" (6.6) leva a um Lançamento de outro Mês
   * (`/?mes=…&lancamento=…`). A página valida o formato.
   */
  mesInicial?: string;
  /** O Lançamento cujo painel já abre (junto de `mesInicial`). Se ele não está no Mês, o painel fecha com o aviso de sempre. */
  lancamentoInicial?: string;
}) {
  // O relógio fica fora do núcleo: "hoje" é lido aqui, uma vez.
  const [atual] = useState(() => mesAtual(hojeEmSaoPaulo(new Date())));
  const [mesAberto, setMesAberto] = useState(mesInicial ?? atual);
  const mesAbertoRef = useRef(mesAberto);
  useEffect(() => {
    mesAbertoRef.current = mesAberto;
  }, [mesAberto]);
  const [filtros, setFiltros] = useState<FiltrosGrade>(FILTROS_VAZIOS);
  const [ordem, setOrdem] = useState<Ordem>(ORDEM_PADRAO);
  const [importando, setImportando] = useState(false);
  // O anúncio de "N lançamentos" só depois que os filtros mudam a grade.
  const [anunciar, setAnunciar] = useState(false);
  const [painel, setPainel] = useState<EstadoPainel>(() =>
    lancamentoInicial === undefined ? null : { modo: "editar", id: lancamentoInicial },
  );
  const [selecao, setSelecao] = useState<ReadonlySet<string>>(() => new Set());
  const [excluindo, setExcluindo] = useState<string | null>(null);
  // A mãe cuja janela "Dividir" está aberta (História 3.8).
  const [dividindo, setDividindo] = useState<string | null>(null);
  // As janelas da barra de Seleção (4.4) e a gravação em lote em curso.
  const [classificandoLote, setClassificandoLote] = useState(false);
  const [excluindoLote, setExcluindoLote] = useState(false);
  const [gerandoMensagem, setGerandoMensagem] = useState(false);
  // "Aplicar status" aberta: o "hoje" (America/Sao_Paulo) de quando abriu; `null` é fechada (6.1).
  const [aplicandoStatus, setAplicandoStatus] = useState<string | null>(null);
  // "Programar dívida" aberta (6.6): os ids que a janela programa (a Seleção, uma linha da grade ou o painel); `null` é fechada.
  const [programando, setProgramando] = useState<readonly string[] | null>(null);
  // O Bloco cuja janela "Gerar mensagem" (forma 2, 4.7) está aberta.
  const [blocoDaMensagem, setBlocoDaMensagem] = useState<string | null>(null);
  const [lotando, setLotando] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const faturas = useLinhas("faturas");
  const cartoes = useLinhas("fatura_cartoes");
  const lancamentos = useLinhas("lancamentos");
  const responsaveis = useLinhas("responsaveis");
  const tipos = useLinhas("tipos");
  const status = useLinhas("status");
  // Os itens de Pagamento do Mês aberto (6.1): quem tem Pagamento e quanto já foi quitado.
  const itensDePagamento = useLinhas("pagamento_itens");
  // Os Pagamentos vivos de todos os Meses (o "Recebido no mês" do hero, 6.5).
  const pagamentos = useLinhas("pagamentos");
  const online = useConexao();
  const hoje = useHoje();
  const ciclo = useLinhas("config_ciclo");
  const configuracoes = useLinhas("configuracoes");
  // O Bloco que filtra a grade (História 4.3): quem entra vem de `avaliar` sobre a
  // projeção do Painel, a mesma do valor do cartão, e é recalculado a cada
  // mudança (Bloco editado, Lançamento mudado, outro Mês).
  const blocosLidos = useLinhas("blocos");
  const blocos = useMemo(() => lerBlocos(blocosLidos.linhas), [blocosLidos.linhas]);
  const projecao = useMemo(() => projetarPainel(lancamentos.linhas, mesAberto), [lancamentos.linhas, mesAberto]);
  const doBloco = useMemo(() => resolverBloco(filtros, blocos, projecao), [filtros, blocos, projecao]);
  // Os Lançamentos não excluídos do Mês aberto (a Seleção, a exclusão e a classificação em lote leem daqui).
  const doMes = useMemo(() => linhasDoMes(lancamentos.linhas, mesAberto), [lancamentos.linhas, mesAberto]);
  // Para o "Desfazer" do "Desvincular" ler a classificação atual da mãe.
  const linhasRef = useRef(lancamentos.linhas);
  useEffect(() => {
    linhasRef.current = lancamentos.linhas;
  }, [lancamentos.linhas]);
  const lerLinha = useCallback((id: string) => linhasRef.current.find((l) => l.id === id), []);

  // A memória de `lancamentos` (e a dos itens de Pagamento deles) acompanha o Mês aberto.
  useEffect(() => {
    gerenciador("lancamentos").abrirMes(mesAberto);
    gerenciador("pagamento_itens").abrirMes(mesAberto);
  }, [mesAberto]);

  const cadastros = useMemo<CadastrosGrade>(
    () => ({
      tipos: new Map(tipos.linhas.map((t) => [t.id, t.nome])),
      responsaveis: new Map(responsaveis.linhas.map((r) => [r.id, { nome: r.nome, cor: r.cor }])),
      status: new Map(status.linhas.map((s) => [s.id, { nome: s.nome, conta_como_pago: s.conta_como_pago }])),
    }),
    [tipos.linhas, responsaveis.linhas, status.linhas],
  );
  // Para a mensagem (4.6): os Status que contam como pago e o modelo salvo.
  const statusPagos = useMemo(() => new Set(status.linhas.filter((s) => s.conta_como_pago).map((s) => s.id)), [status.linhas]);
  // Os que um Pagamento quitou (o "pago" que não se tira à mão) e o quanto cada linha já recebeu (Pago parcialmente, 6.2).
  const quitadasPorPagamento = useMemo(() => idsQuitadosPorPagamento(itensDePagamento.linhas), [itensDePagamento.linhas]);
  // Os Lançamentos do Mês aberto com Pagamento vivo (6.9): mexer no Valor deles, ou excluí-los, pede o aviso do Saldo (FR-46).
  const comPagamento = useMemo(() => idsComPagamento(itensDePagamento.linhas), [itensDePagamento.linhas]);
  const contextoDoAviso = useMemo<ContextoDoAviso>(() => ({ blocos, statusPagos, hoje }), [blocos, statusPagos, hoje]);
  // "Pago parcialmente" e o que falta (derivados do núcleo, nunca gravados): a grade e o painel do Lançamento leem daqui.
  const faltaPorLinha = useMemo(() => {
    const recebido = somaDosItens(itensDePagamento.linhas);
    const falta = new Map<string, number>();
    for (const l of doMes) {
      const f = faltaDoParcial(l, statusPagos, recebido.get(l.id) ?? 0);
      if (f !== null) falta.set(l.id, f);
    }
    return falta;
  }, [itensDePagamento.linhas, doMes, statusPagos]);
  // Os itens só valem lidos e do Mês aberto (até lá, "Aplicar status" com Pagamento espera).
  const itensProntos = itensDePagamento.status === "pronto" && itensDePagamento.mes === mesAberto;
  // Atrasado (6.4): o vencimento vem da Fatura do Mês (ou do Ciclo, sem Fatura); a tolerância, de Configurações.
  const vencimentosDasFaturas = useMemo(() => new Map(faturas.linhas.map((f) => [f.mes, f.vencimento] as const)), [faturas.linhas]);
  const toleranciaDeAtraso = configuracoesDoDono(configuracoes.linhas)?.tolerancia_atraso_dias ?? TOLERANCIA_ATRASO_PADRAO_DIAS;
  const atrasoPronto = ciclo.status === "pronto" && configuracoes.status === "pronto" && faturas.status === "pronto" && itensProntos;
  const atrasoPorLinha = useMemo(
    () =>
      atrasoPronto
        ? atrasosDasLinhas(doMes, hoje, toleranciaDeAtraso, {
            statusPagos,
            configsCiclo: ciclo.linhas,
            vencimentosDasFaturas,
            recebidoCentavos: somaDosItens(itensDePagamento.linhas),
          })
        : SEM_ATRASO,
    [atrasoPronto, doMes, hoje, toleranciaDeAtraso, statusPagos, ciclo.linhas, vencimentosDasFaturas, itensDePagamento.linhas],
  );
  const atrasadas = useMemo(() => new Set(atrasoPorLinha.keys()), [atrasoPorLinha]);
  // O que está em aberto no Mês aberto (projetarPendente) e o que cada Bloco de cobrança soma dele (6.5).
  const pendentesDoMes = useMemo(
    () =>
      itensProntos
        ? pendentesDosLancamentos(lancamentos.linhas, {
            mes: mesAberto,
            statusPagos,
            itens: itensDePagamento.linhas,
            mesesComFatura: new Set(vencimentosDasFaturas.keys()),
            hoje,
          })
        : null,
    [itensProntos, lancamentos.linhas, mesAberto, statusPagos, itensDePagamento.linhas, vencimentosDasFaturas, hoje],
  );
  const recebimentosDoHero = useMemo(() => {
    const falta =
      pendentesDoMes !== null && blocosLidos.status === "pronto" && status.status === "pronto"
        ? faltaReceberDoMes(blocos, pendentesDoMes)
        : null;
    return {
      recebidoCentavos: pagamentos.status === "pronto" ? recebidoNoMes(pagamentos.linhas, mesAberto) : null,
      faltaCentavos: falta === null || falta.blocos === 0 ? null : falta.totalCentavos,
    };
  }, [pendentesDoMes, blocosLidos.status, status.status, blocos, pagamentos.status, pagamentos.linhas, mesAberto]);
  const modeloDaMensagem = useMemo(
    () => lerModelo(configuracoesDoDono(configuracoes.linhas)?.modelo_mensagem),
    [configuracoes.linhas],
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

  const abrirImportar = () => setImportando(true);
  const mudarFiltros = (atualizar: (f: FiltrosGrade) => FiltrosGrade) => {
    setFiltros(atualizar);
    setAnunciar(true);
  };
  // O Bloco do filtro foi excluído em outro aparelho (ou ficou sem valor): o filtro
  // se desfaz e um aviso conta por quê. A exclusão feita aqui desfaz antes de gravar
  // (`aoExcluindo`), então nunca cai aqui. Só vale com a lista de Blocos já lida.
  const motivoDesfazerBloco = motivoParaDesfazerBloco(doBloco, blocosLidos.status === "pronto");
  const [blocosDesfeitos, setBlocosDesfeitos] = useState<{ n: number; texto: string }>({ n: 0, texto: "" });
  if (motivoDesfazerBloco !== null) {
    // Ajuste durante a renderização: desfaz já e conta o aviso para o efeito.
    setFiltros(limparBloco);
    setAnunciar(true);
    setBlocosDesfeitos((d) => ({ n: d.n + 1, texto: TEXTOS_BLOCO[motivoDesfazerBloco] }));
  }
  useEffect(() => {
    if (blocosDesfeitos.n > 0) toast.mostrar({ texto: blocosDesfeitos.texto });
  }, [blocosDesfeitos, toast]);
  const filtrar = (id: string | null) => mudarFiltros((f) => alternarResponsavelUnico(f, id));
  // O selo e "Ver lançamentos" ligam "Verificar" sem mexer nos outros filtros.
  const ligarVerificar = () => mudarFiltros((f) => ({ ...f, verificar: true }));
  const limparTudo = () => {
    mudarFiltros(() => FILTROS_VAZIOS);
    setOrdem(ORDEM_PADRAO);
  };
  const mudarMes = (mes: string) => {
    // A Seleção é de um Mês só: o núcleo a limpa e diz se há o que avisar (só havendo Seleção).
    const troca = aoTrocarDeMes(selecao, mesAbertoRef.current, mes);
    if (troca.aviso !== null) toast.mostrar({ texto: troca.aviso });
    setMesAberto(mes);
    setAnunciar(false);
    // A seleção e o painel são do Mês.
    setSelecao(new Set(troca.selecao));
    setPainel(null);
    setDividindo(null);
    setGerandoMensagem(false);
    setAplicandoStatus(null);
    setProgramando(null);
    setBlocoDaMensagem(null);
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

  // A Seleção já vem podada à grade (só o que o filtro mostra), então estes dois agem exatamente nas marcadas.
  const planoDaExclusao = planejarExclusaoEmLote(selecao, doMes);
  const partesMarcadas = contarPartes(selecao, doMes);

  /**
   * Grava `campos` em toda a Seleção: a função da 3.3, tudo ou nada; falhou, nada mudou e a
   * Seleção fica. `rotulo` é o texto do aviso com "Desfazer". Um Status "não pago" numa linha
   * com Pagamento é recusado antes de gravar (AD-10: desfaça o pagamento antes).
   */
  async function gravarCamposNaSelecao(campos: CamposDoLote, rotulo: (n: number) => string): Promise<ResultadoAplicar> {
    const entradas = planejarClassificacaoEmLote(selecao, doMes, campos);
    if (entradas.length === 0) {
      toast.mostrar({ texto: TEXTOS_SELECAO.nada_a_mudar });
      return { ok: true };
    }
    if (campos.status_id !== undefined) {
      const afetadas = entradas.flatMap((e) => doMes.filter((l) => l.id === e.id));
      const recusa = recusarStatusNaoPago(campos.status_id, statusPagos, afetadas, quitadasPorPagamento);
      if (!recusa.ok) return { ok: false, texto: mensagemDoPagamento(recusa.erro) };
    }
    setLotando(true);
    const r = await repoLancamentos().classificarEmLote(entradas);
    setLotando(false);
    if (!r.ok) return { ok: false, texto: mensagem(r.codigo) };
    if (r.gravadas === 0) {
      toast.mostrar({ texto: TEXTOS_SELECAO.nada_a_mudar });
      return { ok: true };
    }
    // Como no Revisar: a parcela classificada preenche os previstos vazios da Série (sem perguntar).
    const comSerie = parcelasDoLote(r);
    if (comSerie.length > 0) void repoLancamentos().propagarAosPrevistos(comSerie);
    toast.mostrar({
      texto: rotulo(r.gravadas),
      aoDesfazer: () => {
        void repoLancamentos()
          .desfazerLote(r.antes)
          .then((d) => {
            if (!d.ok) toast.mostrar({ texto: mensagem(d.codigo) });
          });
      },
    });
    return { ok: true };
  }

  /**
   * "Programar dívida" (6.6): a data combinada e a observação para `programando`. O núcleo diz quais linhas
   * valem (mãe dividida → partes, Ajuste com a parcela, pagas fora); a RPC grava tudo ou nada, e o aviso tem
   * o "Desfazer". O erro volta à janela, que fica aberta.
   */
  async function programarDivida(data: string, observacao: string): Promise<ResultadoAplicar> {
    const plano = planejarProgramacao(
      programando ?? [],
      doMes,
      { statusPagos, recebidoCentavos: somaDosItens(itensDePagamento.linhas), agora: new Date().toISOString() },
      { data, observacao },
    );
    if (!plano.ok) return { ok: false, texto: mensagem(plano.erro.codigo) };
    if (plano.valor.itens.length === 0) {
      toast.mostrar({ texto: TEXTOS_SELECAO.nada_a_mudar });
      return { ok: true };
    }
    setLotando(true);
    const r = await repoLancamentos().programarDivida(plano.valor.itens);
    setLotando(false);
    if (!r.ok) return { ok: false, texto: mensagem(r.codigo) };
    toast.mostrar({
      texto: rotuloProgramados(plano.valor.programados, data, plano.valor.pagos),
      aoDesfazer: () => {
        void repoLancamentos()
          .programarDivida(plano.valor.desfazer)
          .then((d) => {
            if (!d.ok) toast.mostrar({ texto: mensagem(d.codigo) });
          });
      },
    });
    return { ok: true };
  }

  /** Desliga a Dívida programada das linhas `ids` (o interruptor do painel do Lançamento), com "Desfazer". */
  async function desprogramar(ids: readonly string[]) {
    const plano = planejarDesligar(ids, doMes, { agora: new Date().toISOString() });
    if (!plano.ok) {
      toast.mostrar({ texto: mensagem(plano.erro.codigo) });
      return;
    }
    setLotando(true);
    const r = await repoLancamentos().programarDivida(plano.valor.itens);
    setLotando(false);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return;
    }
    toast.mostrar({
      texto: rotuloDesprogramados(plano.valor.programados),
      aoDesfazer: () => {
        void repoLancamentos()
          .programarDivida(plano.valor.desfazer)
          .then((d) => {
            if (!d.ok) toast.mostrar({ texto: mensagem(d.codigo) });
          });
      },
    });
  }

  /** "Classificar em lote": o erro vira aviso e a janela fica aberta. */
  async function classificarSelecao(campos: CamposDoLote): Promise<boolean> {
    const r = await gravarCamposNaSelecao(campos, rotuloLancamentosClassificados);
    if (!r.ok) toast.mostrar({ texto: r.texto });
    return r.ok;
  }

  /**
   * "Aplicar status": com um Status que conta como pago, o Pagamento (um pedido, uma transação, com o
   * "Desfazer" do aviso); senão só o Status muda. O erro volta à janela, que fica aberta.
   */
  async function aplicarStatus(escolha: EscolhaAplicada): Promise<ResultadoAplicar> {
    if (escolha.tipo === "status") return gravarCamposNaSelecao({ status_id: escolha.statusId }, rotuloStatusAplicado);
    setLotando(true);
    const r = await repoPagamentos().aplicar(escolha.pedido);
    setLotando(false);
    if (!r.ok) return { ok: false, texto: mensagem(r.codigo) };
    toast.mostrar({
      texto:
        escolha.pedido.modo === "parcial"
          ? rotuloPagamentoParcial(escolha.pedido.valor_recebido_centavos, escolha.quitados)
          : rotuloLancamentosPagos(escolha.quantidade),
      aoDesfazer: () => {
        void repoPagamentos()
          .desfazer(r.pagamento.id)
          .then((d) => {
            if (!d.ok) toast.mostrar({ texto: mensagem(d.codigo) });
          });
      },
    });
    return { ok: true };
  }

  /** "Excluir": as marcadas e os Ajustes delas numa gravação só (`junto`), com "Desfazer". */
  async function excluirSelecao() {
    const { ids, ajustes } = planoDaExclusao;
    const [principal, ...demais] = ids;
    if (principal === undefined) return;
    const junto = [...demais, ...ajustes];
    // Fecha antes de gravar: as linhas saem do painel lateral e da Seleção.
    setPainel((p) => (p?.modo === "editar" && (ids.includes(p.id) || ajustes.includes(p.id)) ? null : p));
    setSelecao((s) => {
      const nova = new Set(s);
      for (const id of ids) nova.delete(id);
      return nova;
    });
    setLotando(true);
    const r = junto.length > 0 ? await repoLancamentos().excluir(principal, { junto }) : await repoLancamentos().excluir(principal);
    setLotando(false);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return;
    }
    toast.mostrar({
      texto: rotuloLancamentosExcluidos(ids.length),
      aoDesfazer: () => {
        void repoLancamentos()
          .restaurar(principal, ...(junto.length > 0 ? [{ junto }] : []))
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
    // Conferência, "Total a pagar" e "verificar" usam a mãe; as filhas de uma Divisão não entram (História 3.8).
    const daFatura = fatura ? linhasDaFatura(doMes).filter((l) => l.fatura_id === fatura.id) : [];
    const conferencia = fatura ? conferir(fatura, cartoes.linhas, doMes) : null;
    // Soma, filtros, contagens, anúncio e seleção olham as unidades: a mãe dividida fica de fora e valem
    // as filhas (a mãe aparece só como cabeçalho). O Ajuste segue a mãe dele.
    const unidades = unidadesDoMes(doMes);
    // Mês sem Fatura mas com histórico da planilha (3.10): o hero mostra o total dessas linhas.
    const historico = fatura ? null : resumoDoHistorico(doMes);
    const maesDivididas = new Map(doMes.filter(ehMaeDividida).map((l) => [l.id, l]));
    // O Mês todo (painel do Lançamento, Seleção) e o que a grade julga: com um Bloco
    // filtrando, só as unidades que `avaliar` diz que entram, separadas dos Ajustes
    // depois (assim a grade, os Ajustes sob cada mãe e o total do rodapé são
    // exatamente o que o Bloco soma; ver `restringirAoBloco`).
    const doMesTodo = separarAjustes(unidades);
    const daGrade = doBloco.estado === "ativo" ? separarAjustes(restringirAoBloco(unidades, doBloco)) : doMesTodo;
    const { maes, ajustesPorMae } = daGrade;
    // Sem Fatura não há o que verificar (nem a pílula): o filtro fica guardado.
    const verificando = filtros.verificar && conferencia !== null;
    const efetivos = { ...filtros, verificar: verificando };
    const naGrade = aplicarFiltros(maes, filtros, conferencia, undefined, atrasadas);
    const cadastrosFiltro = { responsaveis: responsaveis.linhas, tipos: tipos.linhas, status: status.linhas };
    const listar = (c: ColunaFiltro, extras: readonly (string | null)[] = []) =>
      valoresDaColuna(c, maes, filtros, conferencia, cadastrosFiltro, extras, atrasadas);
    const opcoes = Object.fromEntries(COLUNAS_DA_BARRA.map((c) => [c, listar(c)])) as Record<ColunaFiltro, OpcaoFiltro[]>;
    const abertaNoMes = aberta && aberta.excluido_em === null ? aberta : null;
    // A mãe do Ajuste aberto (se ele é Ajuste de uma linha do Mês).
    const maeDaAberta =
      abertaNoMes?.ajuste_de_id && doMesTodo.ajustesPorMae.get(abertaNoMes.ajuste_de_id)?.some((a) => a.id === abertaNoMes.id)
        ? (doMes.find((l) => l.id === abertaNoMes.ajuste_de_id) ?? null)
        : null;
    // A linha aberta que uma edição (ou o Bloco) tirou do filtro continua na grade (opção A);
    // num Ajuste, fica a mãe (com ele embaixo). Uma linha que a grade já mostra não precisa dela.
    const linhaFixa =
      ehMaeDividida(abertaNoMes ?? {}) || naGrade.some((l) => l.id === abertaNoMes?.id) ? null : (maeDaAberta ?? abertaNoMes);
    const idsNaGrade = naGrade.map((l) => l.id);
    // A Seleção é sempre um subconjunto do que a grade mostra com os filtros de agora: o que sai do filtro
    // (ou foi excluído em outro aparelho) sai dela, e a contagem e o total são só das marcadas à vista.
    const selecionados = selecaoValida(selecao, idsNaGrade);
    if (selecionados.size !== selecao.size) setSelecao(selecionados);
    // O que o rodapé da grade soma: as mães filtradas e os Ajustes delas. O total da barra é desta mesma lista.
    const visiveis = naGrade.flatMap((l) => [l, ...(ajustesPorMae.get(l.id) ?? [])]);
    const resumo = resumoDaSelecao(selecionados, visiveis);
    // Sem Seleção a janela da mensagem fecha (excluída em outro aparelho): o estado não pode reabri-la na próxima marcação.
    if (gerandoMensagem && selecionados.size === 0) setGerandoMensagem(false);
    if (aplicandoStatus !== null && selecionados.size === 0) setAplicandoStatus(null);
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
          ajustes={maeDaAberta ? [] : (doMesTodo.ajustesPorMae.get(abertaNoMes.id) ?? [])}
          filhas={filhasPorMae(doMes).get(abertaNoMes.id) ?? []}
          maeDaParte={abertaNoMes.dividido_de_id ? (doMes.find((l) => l.id === abertaNoMes.dividido_de_id) ?? null) : null}
          aoDividir={setDividindo}
          aoProgramar={(id) => setProgramando([id])}
          aoDesprogramar={(id) => void desprogramar([id])}
          lerLinha={lerLinha}
          conferencia={conferencia}
          cadastros={cadastrosPainel}
          statusPagos={statusPagos}
          quitadasPorPagamento={quitadasPorPagamento}
          comPagamento={comPagamento}
          contextoDoAviso={contextoDoAviso}
          faltaCentavos={faltaPorLinha.get(abertaNoMes.id) ?? null}
          atrasadoDesde={atrasoPorLinha.get(abertaNoMes.id) ?? null}
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
              recebimentos={recebimentosDoHero}
              aoAbrirRecebimentos={() => router.push("/recebimentos")}
            />
          </div>
          <div className="w-full lg:w-3/5">
            <BlocosDoMes
              linhas={lancamentos.linhas}
              mes={mesAberto}
              temFatura={fatura !== null}
              ativoId={doBloco.estado === "ativo" ? doBloco.id : null}
              aoFiltrar={(id) => mudarFiltros((f) => alternarBloco(f, id))}
              aoExcluindo={(id) => mudarFiltros((f) => (f.bloco === id ? limparBloco(f) : f))}
              aoGerarMensagem={setBlocoDaMensagem}
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
          bloco={doBloco.estado === "ativo" ? { nome: doBloco.nome } : null}
          mostrarLimpar={temFiltro(efetivos) || !ehOrdemPadrao(ordem)}
          aoLimparTudo={limparTudo}
        />
        <p role="status" className="sr-only">
          {anunciar ? rotuloLancamentos(naGrade.length) : ""}
        </p>
        <GradeLancamentos
          mesTemFatura={fatura !== null}
          faltaPorLinha={faltaPorLinha}
          atrasoPorLinha={atrasoPorLinha}
          linhas={naGrade}
          ajustesPorMae={ajustesPorMae}
          maesDivididas={maesDivididas}
          aoDividir={setDividindo}
          aoProgramar={(id) => setProgramando([id])}
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
          aoSelecionar={(id) => setSelecao((s) => alternarSelecao(selecaoValida(s, idsNaGrade), id))}
          aoSelecionarTodos={() => setSelecao((s) => alternarTodos(selecaoValida(s, idsNaGrade), idsNaGrade))}
          semCaixaId={linhaFixa?.id ?? null}
          abertoId={abertaNoMes?.id ?? null}
          aoAbrir={(id) => setPainel({ modo: "editar", id })}
          aoExcluir={setExcluindo}
          linhaFixa={linhaFixa}
        />
        {/* A região do anúncio fica no DOM, vazia, antes da primeira marcação: assim o leitor de tela a anuncia desde a primeira. */}
        <p role="status" className="sr-only">
          {resumo.texto}
        </p>
        <AtalhoSelecionarTodos aoAtalho={() => setSelecao((s) => selecionarTudo(selecaoValida(s, idsNaGrade), idsNaGrade))} />
        {selecionados.size > 0 ? (
          <>
            {/* Folga para a barra não cobrir o rodapé da grade. */}
            <div aria-hidden style={{ height: "var(--altura-barra-inferior, 5rem)" }} />
            <BarraSelecaoPainel
              resumo={resumo}
              ocupado={lotando}
              comPainelLateral={painelLateral !== null}
              podeExcluir={planoDaExclusao.ids.length > 0}
              online={online}
              aoLimpar={() => setSelecao(new Set())}
              aoAplicarStatus={() => setAplicandoStatus(hojeEmSaoPaulo(new Date()))}
              aoProgramar={() => setProgramando([...selecionados])}
              aoClassificar={() => setClassificandoLote(true)}
              aoExcluir={() => setExcluindoLote(true)}
              aoGerarMensagem={() => setGerandoMensagem(true)}
            />
            {aplicandoStatus !== null ? (
              <JanelaAplicarStatus
                aberta
                aoMudar={(abrir) => {
                  if (!abrir) setAplicandoStatus(null);
                }}
                descricao={resumo.texto}
                status={statusAtivos(status.linhas).map((s) => ({ id: s.id, nome: s.nome, contaComoPago: statusPagos.has(s.id) }))}
                projecao={itensProntos ? projetarPagamento(selecionados, doMes, { statusPagos, itens: itensDePagamento.linhas }) : null}
                hoje={aplicandoStatus}
                online={online}
                aoAplicar={aplicarStatus}
              />
            ) : null}
            {gerandoMensagem ? (
              <JanelaGerarMensagem
                aberta
                aoMudar={setGerandoMensagem}
                temFatura={fatura !== null}
                aoEditarModelo={() => router.push(`/configuracoes?secao=${SECAO_MODELO_DA_MENSAGEM}`)}
                aguardando={!itensProntos}
                montar={(incluirPrevistos) =>
                  mensagemDaSelecao(modeloDaMensagem, selecionados, lancamentos.linhas, {
                    mes: mesAberto,
                    statusPagos,
                    temFatura: fatura !== null,
                    incluirPrevistos,
                    itens: itensDePagamento.linhas,
                    hoje,
                  })
                }
              />
            ) : null}
          </>
        ) : null}
        {blocoDaMensagem !== null ? (
          <JanelaMensagemDoBloco
            blocoId={blocoDaMensagem}
            aoMudar={(aberta) => {
              if (!aberta) setBlocoDaMensagem(null);
            }}
            lancamentos={lancamentos.linhas}
            mes={mesAberto}
            temFatura={fatura !== null}
            hoje={hoje}
            statusPagos={statusPagos}
            itens={itensDePagamento.linhas}
            itensProntos={itensProntos}
            modelo={modeloDaMensagem}
            aoEditarModelo={() => router.push(`/configuracoes?secao=${SECAO_MODELO_DA_MENSAGEM}`)}
          />
        ) : null}
      </div>
    );
  }

  const aExcluir = excluindo === null ? undefined : lancamentos.linhas.find((l) => l.id === excluindo);
  // O que sai junto com a linha (os Ajustes e as filhas) e, no lote, as marcadas e os Ajustes delas: o aviso (6.9) olha todas.
  const idsDaExclusao = aExcluir === undefined ? [] : [aExcluir.id, ...ajustesDe(aExcluir.id), ...filhasDe(aExcluir.id)];
  const idsDaExclusaoEmLote = [...planoDaExclusao.ids, ...planoDaExclusao.ajustes];

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
        {aExcluir !== undefined && idsDaExclusao.some((id) => comPagamento.has(id)) ? (
          // Com Pagamento (6.9, FR-46): a mesma confirmação, com o aviso do efeito no Saldo pendente antes da descrição.
          <ConfirmarComPagamento
            mudancas={idsDaExclusao.map((id) => ({ id, patch: { excluido_em: EXCLUIDO_PARA_O_AVISO } }))}
            contexto={contextoDoAviso}
            titulo={TEXTOS_AVISO_PAGAMENTO.titulo_excluir}
            descricao={descricaoExcluirLancamento(nomeExibido(aExcluir), aExcluir.fatura_id !== null, ajustesDe(aExcluir.id).length)}
            rotuloConfirmar={TEXTOS_LANCAMENTO.confirmar_excluir}
            aoCancelar={() => setExcluindo(null)}
            aoConfirmar={() => {
              if (excluindo !== null) void excluir(excluindo);
              setExcluindo(null);
            }}
          />
        ) : (
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
        )}
        {excluindoLote && selecao.size > 0 && planoDaExclusao.ids.length > 0 && idsDaExclusaoEmLote.some((id) => comPagamento.has(id)) ? (
          <ConfirmarComPagamento
            mudancas={idsDaExclusaoEmLote.map((id) => ({ id, patch: { excluido_em: EXCLUIDO_PARA_O_AVISO } }))}
            contexto={contextoDoAviso}
            titulo={TEXTOS_AVISO_PAGAMENTO.titulo_excluir}
            descricao={descricaoExcluirEmLote(planoDaExclusao.ids.length, planoDaExclusao.ajustes.length, planoDaExclusao.partesQueFicam)}
            rotuloConfirmar={TEXTOS_SELECAO.confirmar_excluir}
            aoCancelar={() => setExcluindoLote(false)}
            aoConfirmar={() => {
              setExcluindoLote(false);
              void excluirSelecao();
            }}
          />
        ) : (
          <ConfirmarAcao
            aberta={excluindoLote && selecao.size > 0 && planoDaExclusao.ids.length > 0}
            aoMudar={(abrir) => {
              if (!abrir) setExcluindoLote(false);
            }}
            titulo={TEXTOS_SELECAO.titulo_excluir}
            descricao={descricaoExcluirEmLote(planoDaExclusao.ids.length, planoDaExclusao.ajustes.length, planoDaExclusao.partesQueFicam)}
            rotuloConfirmar={TEXTOS_SELECAO.confirmar_excluir}
            aoConfirmar={() => {
              setExcluindoLote(false);
              void excluirSelecao();
            }}
          />
        )}
        {classificandoLote && selecao.size > 0 ? (
          <JanelaClassificarEmLote
            aberta
            aoMudar={(abrir) => {
              if (!abrir) setClassificandoLote(false);
            }}
            quantidade={selecao.size}
            partes={partesMarcadas}
            responsaveis={responsaveisAtivos(responsaveis.linhas)}
            tipos={tiposAtivos(tipos.linhas)}
            status={statusAtivos(status.linhas)}
            aoAplicar={classificarSelecao}
          />
        ) : null}
        {programando !== null && programando.length > 0 ? (
          <JanelaProgramarDivida
            // Cada abertura é uma janela nova (a data e a observação dela abrem de uma Dívida que já existe).
            key={programando.join(",")}
            aberta
            aoMudar={(abrir) => {
              if (!abrir) setProgramando(null);
            }}
            quantidade={programando.length}
            dataInicial={programadaDe(programando, doMes)?.vencimento_combinado ?? ""}
            observacaoInicial={programadaDe(programando, doMes)?.vencimento_observacao ?? ""}
            hoje={hoje}
            online={online}
            aoProgramar={programarDivida}
          />
        ) : null}
        <DividirLancamento
          alvoId={dividindo}
          aoFechar={() => setDividindo(null)}
          linhas={lancamentos.linhas}
          cadastros={{ responsaveis: responsaveis.linhas, status: status.linhas }}
          statusPadraoId={configuracoes.linhas[0]?.status_padrao_id ?? null}
        />
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
