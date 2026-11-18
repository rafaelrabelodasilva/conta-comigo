"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { lerBlocos } from "@/domain/blocos";
import { TOLERANCIA_ATRASO_PADRAO_DIAS } from "@/domain/configuracoes";
import { atrasosDasLinhas } from "@/domain/atraso";
import { hojeEmSaoPaulo } from "@/domain/datas";
import { aReceber } from "@/domain/divida";
import { alternarSelecao, alternarTodos, selecaoValida } from "@/domain/lancamento";
import {
  TEXTOS_RECEBIMENTOS as T,
  mensagem,
  rotuloLancamentosPagos,
  rotuloPagamentoParcial,
} from "@/domain/mensagens";
import { projetarPagamento, somaDosItens } from "@/domain/pagamento";
import { pendentesDosLancamentos } from "@/domain/projecoes";
import {
  blocosDeCobranca,
  idsSelecionaveis,
  listaEmAberto,
  montarCartoesDeCobranca,
} from "@/domain/recebimentos";
import { resumoDaSelecao } from "@/domain/selecao";
import { ativos as statusAtivos } from "@/domain/status";
import { useConexao } from "@/data/conexao";
import { configuracoesDoDono } from "@/data/configuracoes-repo";
import { repoPagamentos } from "@/data/pagamentos-repo";
import {
  gerenciador,
  gerenciadorItensDoHistorico,
  gerenciadorTodosOsLancamentos,
  useItensDoHistorico,
  useLinhas,
  useTodosOsLancamentos,
} from "@/data/realtime";
import { BarraSelecaoPainel } from "@/features/painel/BarraSelecaoPainel";
import {
  JanelaAplicarStatus,
  type EscolhaAplicada,
  type ResultadoAplicar,
} from "@/features/painel/JanelaAplicarStatus";
import { SECAO_COBRANCA } from "@/features/configuracoes/secoes";
import { Botao } from "@/ui/Botao";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { useToast } from "@/ui/Toast";
import { useHoje } from "@/ui/use-hoje";
import { CartaoDeCobranca } from "./CartaoDeCobranca";
import { HistoricoDePagamentos } from "./HistoricoDePagamentos";
import { ListaAReceber } from "./ListaAReceber";
import { ListaEmAberto } from "./ListaEmAberto";

// Recebimentos (Épico 6, FR-26, AD-11, UX-DR22). Três seções: os cartões por Bloco de cobrança (História 6.5, esta
// tela), "A receber" (6.6, as Dívidas programadas, `ListaAReceber`, calculadas aqui de `aReceber` sobre os mesmos
// Lançamentos de todos os Meses) e o Histórico de Pagamentos (6.3, `HistoricoDePagamentos`, que lê os próprios dados).
//
// Cartões (6.5): um por Bloco marcado "Usar em Recebimentos". O Saldo pendente é a Fórmula do Bloco aplicada às
// linhas de `projetarPendente` (o `restante` de tudo o que está em aberto, de TODOS os Meses, AD-10, AD-11); o selo
// "Em dia", "Não pago" ou "Atrasado" e os Meses em aberto saem do mesmo cálculo (`montarCartoesDeCobranca`). Nada
// aqui calcula dinheiro: a tela só lê, chama o núcleo e desenha.
//
// - Dados (AD-4): os Lançamentos de TODOS os Meses vêm de um gerenciador de Realtime próprio (`useTodosOsLancamentos`:
//   leitura paginada, canal próprio), e os itens de Pagamento vivos, do gerenciador do Histórico. O de `lancamentos`
//   do Painel segue guardando só o Mês aberto. Pagar (aqui ou em outro aparelho) muda os cartões sozinho.
// - "Ver": a lista dos Lançamentos em aberto do Bloco, por Mês, com a Seleção e a barra do Painel. A Seleção junta
//   Meses (o Painel limpa a dele ao trocar de Mês porque a grade é de um Mês só); aqui ela é de UMA lista: fechar a
//   lista ou abrir a de outro Bloco a limpa. Da barra, só "Aplicar status", com os Status que contam como pago
//   (o Pagamento é o da 6.1/6.2, `projetarPagamento` + `planejarPagamento`, sem mudar o que quita nem a alocação).
// - "Cobrar pendências" (6.7) é só a casca: o botão fica desativado.
// - Estados: sem Blocos de cobrança ("Marque em Configurações quais Blocos aparecem aqui", com atalho), carregando
//   (esqueleto), erro com "Tentar de novo" e tudo pago ("Em dia" nos cartões e "Nada em aberto" na lista).

const SEM_ATRASO: ReadonlyMap<string, string> = new Map();

export function Recebimentos() {
  const todos = useTodosOsLancamentos();
  const itens = useItensDoHistorico();
  const blocosLidos = useLinhas("blocos");
  const responsaveis = useLinhas("responsaveis");
  const status = useLinhas("status");
  const faturas = useLinhas("faturas");
  const ciclo = useLinhas("config_ciclo");
  const configuracoes = useLinhas("configuracoes");
  const online = useConexao();
  const hoje = useHoje();
  const toast = useToast();
  const [verId, setVerId] = useState<string | null>(null);
  const [selecao, setSelecao] = useState<ReadonlySet<string>>(() => new Set());
  // "Aplicar status" aberta: o "hoje" (America/Sao_Paulo) de quando abriu; `null` é fechada.
  const [aplicandoStatus, setAplicandoStatus] = useState<string | null>(null);
  const [lotando, setLotando] = useState(false);

  const retratos = [todos, itens, blocosLidos, responsaveis, status, faturas, ciclo, configuracoes];
  const erro = retratos.some((r) => r.status === "erro");
  const pronto = !erro && retratos.every((r) => r.status === "pronto");

  const blocos = useMemo(() => lerBlocos(blocosLidos.linhas), [blocosLidos.linhas]);
  const statusPagos = useMemo(
    () => new Set(status.linhas.filter((s) => s.conta_como_pago).map((s) => s.id)),
    [status.linhas],
  );
  const vencimentosDasFaturas = useMemo(
    () => new Map(faturas.linhas.map((f) => [f.mes, f.vencimento] as const)),
    [faturas.linhas],
  );
  const tolerancia = configuracoesDoDono(configuracoes.linhas)?.tolerancia_atraso_dias ?? TOLERANCIA_ATRASO_PADRAO_DIAS;
  const cadastros = useMemo(
    () => ({ responsaveis: new Map(responsaveis.linhas.map((r) => [r.id, { nome: r.nome, cor: r.cor }])) }),
    [responsaveis.linhas],
  );

  // O que falta receber, linha a linha (projetarPendente) e quem está atrasado, de todos os Meses.
  const pendentes = useMemo(
    () =>
      pronto
        ? pendentesDosLancamentos(todos.linhas, {
            statusPagos,
            itens: itens.linhas,
            mesesComFatura: new Set(vencimentosDasFaturas.keys()),
            hoje,
          })
        : [],
    [pronto, todos.linhas, statusPagos, itens.linhas, vencimentosDasFaturas, hoje],
  );
  const atrasos = useMemo(
    () =>
      pronto
        ? atrasosDasLinhas(todos.linhas, hoje, tolerancia, {
            statusPagos,
            configsCiclo: ciclo.linhas,
            vencimentosDasFaturas,
            recebidoCentavos: somaDosItens(itens.linhas),
          })
        : SEM_ATRASO,
    [pronto, todos.linhas, hoje, tolerancia, statusPagos, ciclo.linhas, vencimentosDasFaturas, itens.linhas],
  );
  const cartoes = useMemo(() => montarCartoesDeCobranca(blocos, pendentes, atrasos), [blocos, pendentes, atrasos]);
  // "A receber" (6.6): as Dívidas programadas em aberto (não dependem de haver Blocos de cobrança).
  const dividas = useMemo(
    () => (pronto ? aReceber(todos.linhas, { statusPagos, itens: itens.linhas, atrasos }) : []),
    [pronto, todos.linhas, statusPagos, itens.linhas, atrasos],
  );

  // A lista do Bloco aberto (some se o Bloco deixou de ser de cobrança ou foi excluído em outro aparelho).
  const aberto = verId === null ? undefined : cartoes.find((c) => c.id === verId);
  const grupos = useMemo(
    () => (aberto === undefined ? [] : listaEmAberto(aberto.ids, todos.linhas, pendentes)),
    [aberto, todos.linhas, pendentes],
  );
  const idsDaLista = useMemo(() => idsSelecionaveis(grupos), [grupos]);
  // A Seleção é sempre um subconjunto do que a lista mostra: o que foi pago (aqui ou noutro aparelho) sai dela.
  const selecionados = selecaoValida(selecao, idsDaLista);
  if (selecionados.size !== selecao.size) setSelecao(selecionados);
  const linhasDaSelecao = useMemo(
    () =>
      grupos.flatMap((g) =>
        g.itens.flatMap((i) => [i, ...i.ajustes]).map((i) => ({
          id: i.pendente.id,
          valor_centavos: i.pendente.restanteCentavos,
          ajuste_de_id: i.lancamento.ajuste_de_id ?? null,
          excluido_em: null,
        })),
      ),
    [grupos],
  );
  const resumo = resumoDaSelecao(selecionados, linhasDaSelecao);
  if (aplicandoStatus !== null && selecionados.size === 0) setAplicandoStatus(null);

  const statusDoPagamento = useMemo(
    () => statusAtivos(status.linhas).filter((s) => statusPagos.has(s.id)).map((s) => ({ id: s.id, nome: s.nome, contaComoPago: true })),
    [status.linhas, statusPagos],
  );
  // A projeção só existe com a janela aberta (o Painel também a calcula a cada desenho).
  const projecao =
    aplicandoStatus === null ? null : projetarPagamento(selecionados, todos.linhas, { statusPagos, itens: itens.linhas });

  function ver(id: string) {
    // Abrir a lista de outro Bloco (ou fechar a aberta) limpa a Seleção: ela é de uma lista só.
    setVerId((atual) => (atual === id ? null : id));
    setSelecao(new Set());
    setAplicandoStatus(null);
  }

  async function aplicar(escolha: EscolhaAplicada): Promise<ResultadoAplicar> {
    // A janela só oferece Status que contam como pago, então sempre vem um Pagamento.
    if (escolha.tipo !== "pagamento") return { ok: false, texto: mensagem("salvar.falhou") };
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

  function tentarDeNovo() {
    void gerenciadorTodosOsLancamentos().recarregar();
    void gerenciadorItensDoHistorico().recarregar();
    for (const t of ["blocos", "responsaveis", "status", "faturas", "config_ciclo", "configuracoes"] as const) {
      void gerenciador(t).recarregar();
    }
  }

  let cartoesDaTela;
  if (erro) {
    cartoesDaTela = <ErroAoCarregar aoTentarDeNovo={tentarDeNovo} />;
  } else if (!pronto) {
    cartoesDaTela = (
      <div role="status" aria-busy="true" className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
        <span className="sr-only">{T.carregando}</span>
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-40" />
        ))}
      </div>
    );
  } else if (blocosDeCobranca(blocos).length === 0) {
    cartoesDaTela = (
      <EstadoVazio
        texto={T.sem_blocos}
        acao={
          <Botao asChild>
            <Link href={`/configuracoes?secao=${SECAO_COBRANCA}`}>{T.ir_para_configuracoes}</Link>
          </Botao>
        }
      />
    );
  } else {
    cartoesDaTela = (
      <ul aria-label={T.titulo} className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
        {cartoes.map((c) => (
          <CartaoDeCobranca
            key={c.id}
            cartao={c}
            corPessoa={c.responsavelId === null ? null : (cadastros.responsaveis.get(c.responsavelId)?.cor ?? null)}
            aberto={c.id === aberto?.id}
            aoVer={() => ver(c.id)}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="titulo-cobranca" className="flex flex-col gap-3">
        <h2 id="titulo-cobranca" className="flex min-h-toque items-center texto-body-strong">
          {T.titulo}
        </h2>
        {cartoesDaTela}
        {pronto && aberto !== undefined ? (
          <ListaEmAberto
            nomeDoBloco={aberto.nome}
            grupos={grupos}
            cadastros={cadastros}
            atrasos={atrasos}
            selecao={selecionados}
            todosMarcados={idsDaLista.length > 0 && selecionados.size === idsDaLista.length}
            aoAlternar={(id) => setSelecao((s) => alternarSelecao(selecaoValida(s, idsDaLista), id))}
            aoAlternarTodos={() => setSelecao((s) => alternarTodos(selecaoValida(s, idsDaLista), idsDaLista))}
            aoFechar={() => ver(aberto.id)}
          />
        ) : null}
        {pronto && aberto !== undefined && statusDoPagamento.length === 0 ? (
          <p className="texto-caption text-text-muted">{T.sem_status_pago}</p>
        ) : null}
        {/* A região do anúncio fica no DOM, vazia, antes da primeira marcação (como no Painel). */}
        <p role="status" className="sr-only">
          {resumo.texto}
        </p>
      </section>
      {erro ? null : <ListaAReceber linhas={dividas} cadastros={cadastros} carregando={!pronto} />}
      <HistoricoDePagamentos />
      {selecionados.size > 0 ? (
        <>
          {/* Folga para a barra não cobrir o fim da página. */}
          <div aria-hidden style={{ height: "var(--altura-barra-inferior, 5rem)" }} />
          <BarraSelecaoPainel
            resumo={resumo}
            ocupado={lotando}
            online={online}
            aoLimpar={() => setSelecao(new Set())}
            aoAplicarStatus={() => setAplicandoStatus(hojeEmSaoPaulo(new Date()))}
          />
          {aplicandoStatus !== null ? (
            <JanelaAplicarStatus
              aberta
              aoMudar={(abrir) => {
                if (!abrir) setAplicandoStatus(null);
              }}
              descricao={resumo.texto}
              status={statusDoPagamento}
              projecao={projecao}
              hoje={aplicandoStatus}
              online={online}
              aoAplicar={aplicar}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

