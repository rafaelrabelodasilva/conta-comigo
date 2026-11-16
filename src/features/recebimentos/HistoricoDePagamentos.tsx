"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatarData } from "@/domain/datas";
import { formatarDinheiro } from "@/domain/dinheiro";
import {
  filtrarHistorico,
  resumirPagamentos,
  responsaveisDoHistorico,
  type LinhaDoHistorico,
} from "@/domain/historico-pagamentos";
import {
  TEXTOS_HISTORICO as T,
  mensagem,
  rotuloDaLinhaDoHistorico,
  rotuloDoModoELancamentos,
  rotuloPagamentoDesfeito,
  rotuloResultadoDoHistorico,
} from "@/domain/mensagens";
import { repoPagamentos, type RepoPagamentos } from "@/data/pagamentos-repo";
import { useConexao } from "@/data/conexao";
import { gerenciador, gerenciadorItensDoHistorico, useItensDoHistorico, useLinhas } from "@/data/realtime";
import { cn } from "@/ui/cn";
import { classesPessoa } from "@/ui/cores-pessoa";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { useToast } from "@/ui/Toast";
import { JanelaDetalhePagamento } from "./JanelaDetalhePagamento";

// Histórico de Pagamentos (História 6.3, FR-25, FR-29, UX-DR22): a seção de Recebimentos que lista todos
// os Pagamentos vivos, do mais novo para o mais antigo, com data, Responsáveis, quantidade de Lançamentos,
// valor RECEBIDO e o modo ("parcial", "minha parte"; o total não leva etiqueta). Filtra por Responsável e
// abre o detalhe, de onde se desfaz o Pagamento. É independente: a 6.5 põe os cartões por Bloco acima.
//
// - Dados (AD-4): os Pagamentos vivos e os itens vivos de TODOS os Meses vêm de dois gerenciadores de
//   Realtime próprios (leitura paginada); um Pagamento novo ou desfeito em outro aparelho chega sozinho.
//   O único dado que a tela lê à parte é de quem são as linhas dos itens (Responsável): em blocos, uma vez
//   por linha nova, pelo repositório. Toda regra (resumo, ordem, Responsáveis, filtro) é do núcleo.
// - O Pagamento desfeito não aparece (AD-16: continua no banco). Se o aberto some (outro aparelho o
//   desfez), a janela fecha e a tela avisa.
// - Sem internet a lista continua (o que já está na memória); "Desfazer pagamento" fica desativado.

type RepoDoHistorico = Pick<
  RepoPagamentos,
  "responsaveisDasLinhas" | "linhasDoPagamento" | "previaDoDesfazer" | "desfazer"
>;

export function HistoricoDePagamentos({ repo = repoPagamentos() }: { repo?: RepoDoHistorico }) {
  const pagamentos = useLinhas("pagamentos");
  const itens = useItensDoHistorico();
  const responsaveis = useLinhas("responsaveis");
  const status = useLinhas("status");
  const online = useConexao();
  const toast = useToast();
  const [filtro, setFiltro] = useState<string | null>(null);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  // De quem são as linhas dos itens (uma leitura por linha nova, em blocos).
  const [conhecidas, setConhecidas] = useState<ReadonlyMap<string, LinhaDoHistorico>>(() => new Map());
  const [falhouEm, setFalhouEm] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  // Sou eu que estou desfazendo: o sumiço do Pagamento é desta tela, não de outro aparelho.
  const desfazendo = useRef(false);
  const focarTitulo = useRef(false);
  const avisadoDe = useRef<string | null>(null);

  const idsDosItens = useMemo(() => [...new Set(itens.linhas.map((i) => i.lancamento_id))].sort(), [itens.linhas]);
  const chaveDasFaltas = useMemo(() => idsDosItens.filter((id) => !conhecidas.has(id)).join(","), [idsDosItens, conhecidas]);

  useEffect(() => {
    if (chaveDasFaltas === "" || itens.status !== "pronto") return;
    let vale = true;
    const pedidas = chaveDasFaltas.split(",");
    void repo.responsaveisDasLinhas(pedidas).then((lidas) => {
      if (!vale) return;
      if (lidas === null) {
        setFalhouEm(chaveDasFaltas);
        return;
      }
      setConhecidas((atual) => {
        const novo = new Map(atual);
        // Uma linha que não voltou (some do alcance) vale "sem Responsável": não pede de novo para sempre.
        for (const id of pedidas) novo.set(id, { id, responsavel_id: null });
        for (const l of lidas) novo.set(l.id, l);
        return novo;
      });
    });
    return () => {
      vale = false;
    };
  }, [chaveDasFaltas, itens.status, repo, tentativa]);

  const cadastros = useMemo(
    () => new Map(responsaveis.linhas.map((r) => [r.id, { nome: r.nome, cor: r.cor }])),
    [responsaveis.linhas],
  );
  const statusNomes = useMemo(() => new Map(status.linhas.map((s) => [s.id, s.nome])), [status.linhas]);
  const resumos = useMemo(
    () => resumirPagamentos(pagamentos.linhas, itens.linhas, conhecidas),
    [pagamentos.linhas, itens.linhas, conhecidas],
  );

  const erro =
    [pagamentos, itens, responsaveis, status].some((r) => r.status === "erro") ||
    (chaveDasFaltas !== "" && falhouEm === chaveDasFaltas);
  const pronto =
    !erro &&
    [pagamentos, itens, responsaveis, status].every((r) => r.status === "pronto") &&
    chaveDasFaltas === "";

  const presentes = useMemo(() => {
    const ids = new Set(responsaveisDoHistorico(resumos));
    // Na ordem do cadastro (a ordem que Rafael escolheu em Configurações).
    return [...responsaveis.linhas].filter((r) => ids.has(r.id)).sort((a, b) => a.ordem - b.ordem);
  }, [resumos, responsaveis.linhas]);
  // O Responsável filtrado pode ter perdido o último Pagamento (desfeito): volta a "Todos".
  const filtroEfetivo = filtro !== null && presentes.some((r) => r.id === filtro) ? filtro : null;
  const visiveis = useMemo(() => filtrarHistorico(resumos, filtroEfetivo), [resumos, filtroEfetivo]);

  const aberto = abertoId === null ? undefined : resumos.find((r) => r.id === abertoId);
  const itensDoAberto = useMemo(
    () => (abertoId === null ? [] : itens.linhas.filter((i) => i.pagamento_id === abertoId)),
    [abertoId, itens.linhas],
  );

  // O Pagamento aberto sumiu sem ser por esta tela: outro aparelho o desfez. A janela fecha (derivado:
  // `aberto` é indefinido) e a tela avisa uma vez.
  useEffect(() => {
    if (abertoId === null || !pronto || aberto !== undefined) return;
    if (desfazendo.current || avisadoDe.current === abertoId) return;
    avisadoDe.current = abertoId;
    toast.mostrar({ texto: mensagem("pagamento.ja_desfeito") });
  }, [abertoId, pronto, aberto, toast]);

  const aoDesfeito = useCallback(
    (valorRecebidoCentavos: number) => {
      toast.mostrar({ texto: rotuloPagamentoDesfeito(valorRecebidoCentavos) });
      focarTitulo.current = true;
      setAbertoId(null);
    },
    [toast],
  );

  const aoJaDesfeito = useCallback(() => {
    toast.mostrar({ texto: mensagem("pagamento.ja_desfeito") });
    focarTitulo.current = true;
    setAbertoId(null);
  }, [toast]);

  const aoTrabalhar = useCallback((trabalhando: boolean) => {
    desfazendo.current = trabalhando;
  }, []);

  function tentarDeNovo() {
    setFalhouEm(null);
    setTentativa((t) => t + 1);
    void gerenciador("pagamentos").recarregar();
    void gerenciadorItensDoHistorico().recarregar();
    void gerenciador("responsaveis").recarregar();
    void gerenciador("status").recarregar();
  }

  let conteudo;
  if (erro) {
    conteudo = <ErroAoCarregar aoTentarDeNovo={tentarDeNovo} />;
  } else if (!pronto) {
    conteudo = (
      <div role="status" aria-busy="true" className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2">
        <span className="sr-only">{T.carregando}</span>
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-toque" />
        ))}
      </div>
    );
  } else if (resumos.length === 0) {
    conteudo = <EstadoVazio texto={T.vazio} acao={<p className="texto-caption text-text-muted">{T.vazio_ajuda}</p>} />;
  } else if (visiveis.length === 0) {
    conteudo = <EstadoVazio texto={T.vazio_do_responsavel} />;
  } else {
    conteudo = (
      <ul aria-label={T.lista} className="flex flex-col rounded-lg border border-border bg-surface">
        {visiveis.map((r) => {
          const nomes = r.responsaveis.map((x) => (x.id === null ? T.sem_responsavel : (cadastros.get(x.id)?.nome ?? T.sem_responsavel)));
          return (
            <li key={r.id} className="border-b border-border-subtle last:border-b-0">
              <button
                type="button"
                aria-label={rotuloDaLinhaDoHistorico({
                  data: r.data,
                  responsaveis: nomes,
                  modo: r.modo,
                  quantidade: r.quantidade,
                  valorRecebidoCentavos: r.valorRecebidoCentavos,
                })}
                onClick={() => setAbertoId(r.id)}
                className="grid min-h-toque w-full cursor-pointer grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2 text-left"
              >
                <span aria-hidden className="texto-number">
                  {formatarData(r.data)}
                </span>
                <span aria-hidden className="flex min-w-0 flex-wrap items-center gap-1">
                  {r.responsaveis.map((x, n) => {
                    const cadastro = x.id === null ? undefined : cadastros.get(x.id);
                    return (
                      <span
                        key={x.id ?? "sem"}
                        className={cn("rounded-full px-2 texto-label", cadastro ? classesPessoa(cadastro.cor).etiqueta : "bg-border-subtle text-text-muted")}
                      >
                        {nomes[n]}
                      </span>
                    );
                  })}
                </span>
                <span aria-hidden className="flex flex-col items-end">
                  <span className="texto-number">{formatarDinheiro(r.valorRecebidoCentavos)}</span>
                  <span className="texto-caption text-text-muted">{rotuloDoModoELancamentos(r.modo, r.quantidade)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section aria-labelledby="titulo-historico" className="flex flex-col gap-3">
      <header className="flex min-h-toque flex-wrap items-center gap-3">
        <h2 id="titulo-historico" ref={tituloRef} tabIndex={-1} className="flex-1 texto-body-strong outline-none">
          {T.titulo}
        </h2>
        {pronto && resumos.length > 0 ? (
          <div role="group" aria-label={T.filtrar} className="flex flex-wrap items-center gap-2">
            {[null, ...presentes].map((r) => {
              const ligado = (r?.id ?? null) === filtroEfetivo;
              return (
                <button
                  key={r?.id ?? "todos"}
                  type="button"
                  aria-pressed={ligado}
                  onClick={() => setFiltro(r?.id ?? null)}
                  className={cn(
                    "inline-flex min-h-toque cursor-pointer items-center gap-1.5 rounded-full border px-3 texto-body",
                    ligado ? "border-accent-line bg-selection text-text texto-body-strong" : "border-border bg-surface text-text-muted",
                  )}
                >
                  {r === null ? (
                    T.todos
                  ) : (
                    <>
                      <span aria-hidden className={cn("size-2.5 rounded-full", classesPessoa(r.cor).fundo)} />
                      {r.nome}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ) : null}
      </header>
      {pronto && resumos.length > 0 ? (
        <p role="status" className="sr-only">
          {rotuloResultadoDoHistorico(visiveis.length)}
        </p>
      ) : null}
      {conteudo}
      {aberto === undefined ? null : (
        <JanelaDetalhePagamento
          key={aberto.id}
          resumo={aberto}
          itens={itensDoAberto}
          responsaveis={cadastros}
          statusNomes={statusNomes}
          online={online}
          repo={repo}
          aoMudar={(a) => {
            if (!a) setAbertoId(null);
          }}
          aoTrabalhar={aoTrabalhar}
          aoDesfeito={aoDesfeito}
          aoJaDesfeito={aoJaDesfeito}
          aoFecharFoco={(e) => {
            // Depois de desfazer, a linha que abriu a janela não existe mais: o foco vai para o título da seção.
            if (!focarTitulo.current) return;
            focarTitulo.current = false;
            e.preventDefault();
            tituloRef.current?.focus();
          }}
        />
      )}
    </section>
  );
}
