"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { conferir } from "@/domain/conferencia";
import { alternarSelecao, alternarTodos, estadoCaixaCabecalho, selecaoValida } from "@/domain/lancamento";
import { entradasDeSugestoes, totalDaSelecao, type EntradaDoLote } from "@/domain/lote";
import {
  TEXTOS_REVISAR as T,
  mensagem,
  perguntaAplicarAosPrevistos,
  rotuloClassificados,
  rotuloClassificadosSemSugestao,
  rotuloFaixaImportacao,
  rotuloFaltam,
  rotuloPrevistosAtualizados,
  rotuloSelecionarGrupo,
  rotuloSeloConferencia,
} from "@/domain/mensagens";
import type { MudancaDoPrevisto } from "@/domain/previstos";
import { ativos as responsaveisAtivos } from "@/domain/responsaveis";
import { montarFila, resumoDaFila, resumoDaImportacao, type ItemDaFila } from "@/domain/revisar";
import { ativos as tiposAtivos } from "@/domain/tipos";
import {
  repoLancamentosRevisar,
  type AnteriorDaFila,
  type LinhaLancamento,
  type ParcelaReclassificada,
  type ResultadoLote,
} from "@/data/lancamentos-repo";
import { gerenciador, gerenciadorFila, useFilaRevisar, useLinhas } from "@/data/realtime";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { FaixaPergunta } from "@/ui/FaixaPergunta";
import { Tela } from "@/ui/Tela";
import { useToast } from "@/ui/Toast";
import { BarraLote } from "./BarraLote";
import { CaixaLote } from "./CaixaLote";
import { ItemRevisar } from "./ItemRevisar";
import { JanelaLote } from "./JanelaLote";
import { JanelaMudar } from "./JanelaMudar";

// Revisar (História 3.2, FR-13): a fila do que a importação não classificou,
// agrupada por Nome, com a sugestão à vista, ✓ para confirmar num toque e
// "Mudar" para escolher Responsável e Tipo. O número "Faltam N", o contador
// do menu e a lista saem da mesma regra do núcleo (`ehDaFila`) sobre o
// gerenciador da fila (todos os Meses), então são sempre o mesmo.
//
// Confirmar e "Mudar" gravam pelo repositório de Lançamentos (limpa o motivo
// e ensina a Regra) e mostram "Classificado · Desfazer" (6 s), que devolve
// a linha à fila. Falhou ao gravar: o item fica e o toast diz o motivo. A
// faixa de resumo do topo é a da importação do Mês da Fatura mais recente.
//
// Lote (História 3.3): cada item tem uma caixa; o grupo com título e o topo
// ("Selecionar todos", todos os Meses da fila) marcam vários de uma vez. Com
// 1+ marcado aparece a barra de lote ("Responsável…", "Tipo…", "Aplicar
// sugestões"), que grava tudo numa RPC só pelo repositório (tudo ou nada) e
// oferece "Desfazer" (6 s). A marcação se poda sozinha: o item que sai da fila
// (outro aparelho, ou este lote) sai dela sem aviso e sem gravar; durante uma
// gravação ela fica como está, para uma falha não perdê-la.
//
// Previstos (História 3.5): classificar uma parcela real preenche sozinho os
// previstos vazios da Série; se algum tem outro valor (✓ e "Mudar"), a faixa
// "Só este" / "Aplicar a todos" pergunta. No lote, só o preenchimento.

/** As parcelas do lote com Série, com a classificação de antes (o corpo de `antes` só tem o que mudou). */
function parcelasDoLote(r: Extract<ResultadoLote, { ok: true }>): ParcelaReclassificada[] {
  const antesDe = new Map(r.antes.map((i) => [i.id, i.corpo as Partial<Pick<LinhaLancamento, "responsavel_id" | "tipo_id">>]));
  return r.linhas
    .filter((l) => l.serie_id !== null)
    .map((l) => {
      const a = antesDe.get(l.id);
      return {
        serie_id: l.serie_id,
        parcela_n: l.parcela_n,
        lancado_por: l.lancado_por,
        antes: {
          responsavel_id: a && "responsavel_id" in a ? (a.responsavel_id ?? null) : l.responsavel_id,
          tipo_id: a && "tipo_id" in a ? (a.tipo_id ?? null) : l.tipo_id,
        },
        depois: { responsavel_id: l.responsavel_id, tipo_id: l.tipo_id },
      };
    });
}

function EsqueletoRevisar() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{T.carregando}</span>
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Esqueleto key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}

/** A Fatura do Mês mais recente (a da faixa de resumo). */
function maisRecente<F extends { mes: string }>(faturas: readonly F[]): F | null {
  return faturas.reduce<F | null>((a, f) => (a === null || f.mes > a.mes ? f : a), null);
}

export function Revisar({ titulo }: { titulo: string }) {
  const toast = useToast();
  const fila = useFilaRevisar();
  const responsaveis = useLinhas("responsaveis");
  const tipos = useLinhas("tipos");
  // Só para a faixa de resumo: a Fatura mais recente e os Lançamentos do Mês dela.
  const faturas = useLinhas("faturas");
  const cartoes = useLinhas("fatura_cartoes");
  const lancamentos = useLinhas("lancamentos");
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(() => new Set());
  // Previstos com outro valor, à espera do "Só este" / "Aplicar a todos" (História 3.5).
  const [aPerguntar, setAPerguntar] = useState<MudancaDoPrevisto[]>([]);
  // Numa ref: dois toques seguidos veem o mesmo estado e gravam uma vez só.
  const emCurso = useRef(new Set<string>());
  // O item aberto no "Mudar" (cópia de quando abriu).
  const [mudando, setMudando] = useState<ItemDaFila | null>(null);
  // O lote: os itens marcados, a janela de Responsável ou Tipo e a gravação em curso.
  const [selecao, setSelecao] = useState<ReadonlySet<string>>(() => new Set());
  const [janelaLote, setJanelaLote] = useState<"responsavel" | "tipo" | null>(null);
  const [lotando, setLotando] = useState(false);

  const fatura = useMemo(() => maisRecente(faturas.linhas), [faturas.linhas]);
  const mesDaFatura = fatura?.mes ?? null;
  // A memória de `lancamentos` (por Mês) abre o Mês da faixa de resumo.
  useEffect(() => {
    if (mesDaFatura !== null) gerenciador("lancamentos").abrirMes(mesDaFatura);
  }, [mesDaFatura]);

  const grupos = useMemo(
    () => montarFila(fila.linhas, { responsaveis: responsaveis.linhas, tipos: tipos.linhas }),
    [fila.linhas, responsaveis.linhas, tipos.linhas],
  );
  const resumo = resumoDaFila(grupos);
  const itens = useMemo(() => grupos.flatMap((g) => g.itens), [grupos]);
  // Só estes entram no lote ("Não veio na fatura" tem os seus botões).
  const idsDaFila = useMemo(() => itens.filter((i) => i.selecionavel).map((i) => i.id), [itens]);
  // Só os que ainda estão na fila; com a fila pronta e nada sendo gravado, a marcação se poda.
  const marcados = useMemo(() => selecaoValida(selecao, idsDaFila), [selecao, idsDaFila]);
  if (fila.status === "pronto" && ocupados.size === 0 && marcados.size !== selecao.size) setSelecao(marcados);
  // Sem nada marcado, a janela do lote não tem a quem se aplicar.
  if (janelaLote !== null && marcados.size === 0) setJanelaLote(null);
  const totalMarcados = useMemo(() => totalDaSelecao(marcados, fila.linhas), [marcados, fila.linhas]);
  // A janela fica enquanto o item está na fila ou a gravação dele está em curso: a
  // gravação otimista tira o item da fila, e se o banco recusar a escolha não se perde.
  // Item que some sem gravação daqui (outro aparelho) fecha a janela.
  const itemAberto = mudando === null ? null : (itens.find((i) => i.id === mudando.id) ?? (ocupados.has(mudando.id) ? mudando : null));
  const mudandoSemItem = mudando !== null && itemAberto === null;
  // Ajuste durante a renderização: esquece o item que não está mais lá.
  if (mudandoSemItem) setMudando(null);

  const responsaveisDaJanela = useMemo(() => responsaveisAtivos(responsaveis.linhas), [responsaveis.linhas]);
  const tiposDaJanela = useMemo(() => tiposAtivos(tipos.linhas), [tipos.linhas]);

  const retratos = [fila, responsaveis, tipos];
  const erro = retratos.some((r) => r.status === "erro");
  const carregando = retratos.some((r) => r.status === "carregando");

  const faixa = useMemo(() => {
    if (!fatura || lancamentos.status !== "pronto" || lancamentos.mes !== fatura.mes || cartoes.status !== "pronto") {
      return null;
    }
    const doMes = lancamentos.linhas.filter((l) => l.mes === fatura.mes);
    const conferencia = conferir(fatura, cartoes.linhas, doMes);
    // A faixa conta as linhas da Fatura; o previsto que "não veio" não é linha dela (História 3.6).
    const paraRevisar = itens.filter((i) => i.mes === fatura.mes && i.daFatura).length;
    return rotuloFaixaImportacao(fatura.mes, rotuloSeloConferencia(conferencia), resumoDaImportacao(doMes, fatura.id, paraRevisar));
  }, [fatura, lancamentos.status, lancamentos.mes, lancamentos.linhas, cartoes.status, cartoes.linhas, itens]);

  /**
   * Previstos da Série das parcelas classificadas (decisão 4-A): os vazios
   * recebem sozinhos; com `perguntar`, os que têm outro valor viram a faixa
   * "Só este" / "Aplicar a todos" (no lote, ficam como estão).
   */
  async function propagar(parcelas: ParcelaReclassificada[], perguntar: boolean) {
    const comSerie = parcelas.filter((p) => p.serie_id);
    if (comSerie.length === 0) return;
    const r = await repoLancamentosRevisar().propagarAosPrevistos(comSerie);
    // A falha não tira o "Desfazer" da classificação, que já valeu (como o `aprender`); os previstos ficam como estão.
    if (!r.ok) return;
    if (perguntar && r.aPerguntar.length > 0) setAPerguntar(r.aPerguntar);
  }

  async function responderPrevistos(resposta: "so_este" | "aplicar_a_todos") {
    const pendentes = aPerguntar;
    setAPerguntar([]);
    if (resposta === "so_este" || pendentes.length === 0) return;
    const r = await repoLancamentosRevisar().aplicarAosPrevistos(pendentes);
    toast.mostrar({ texto: r.ok ? rotuloPrevistosAtualizados(r.gravados) : mensagem(r.codigo) });
  }

  /** Grava Responsável e Tipo (limpa o motivo e ensina a Regra) e oferece o "Desfazer". */
  async function classificar(item: ItemDaFila, escolha: { responsavel_id: string; tipo_id: string }): Promise<boolean> {
    const atual = fila.linhas.find((l) => l.id === item.id);
    if (!atual || emCurso.current.has(item.id)) return false;
    emCurso.current.add(item.id);
    // Como estava, para o "Desfazer" (a mãe e os Ajustes voltam juntos).
    const anterior: AnteriorDaFila = {
      responsavel_id: atual.responsavel_id,
      tipo_id: atual.tipo_id,
      revisao_motivo: atual.revisao_motivo,
      revisao_dados: atual.revisao_dados,
      revisado_em: atual.revisado_em,
    };
    const junto = item.ajustes.map((a) => a.id);
    setOcupados((s) => new Set(s).add(item.id));
    const r = await repoLancamentosRevisar().atualizar(item.id, escolha, junto.length > 0 ? { junto } : {});
    emCurso.current.delete(item.id);
    setOcupados((s) => {
      const nova = new Set(s);
      nova.delete(item.id);
      return nova;
    });
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return false;
    }
    void propagar(
      [
        {
          serie_id: r.linha.serie_id,
          parcela_n: r.linha.parcela_n,
          lancado_por: r.linha.lancado_por,
          antes: { responsavel_id: anterior.responsavel_id, tipo_id: anterior.tipo_id },
          depois: { responsavel_id: r.linha.responsavel_id, tipo_id: r.linha.tipo_id },
        },
      ],
      true,
    );
    toast.mostrar({
      texto: T.classificado,
      aoDesfazer: () => {
        void repoLancamentosRevisar()
          .devolverAFila(item.id, anterior, junto.length > 0 ? { junto } : {})
          .then((d) => {
            if (!d.ok) toast.mostrar({ texto: mensagem(d.codigo) });
          });
      },
    });
    return true;
  }

  /** Grava o lote numa chamada só e oferece o "Desfazer"; falhou, nada mudou e a marcação fica. */
  async function aplicarEntradas(entradas: EntradaDoLote[], semSugestao = 0): Promise<boolean> {
    const livres = entradas.filter((e) => !emCurso.current.has(e.id));
    if (livres.length === 0) return false;
    for (const e of livres) emCurso.current.add(e.id);
    setOcupados((s) => {
      const nova = new Set(s);
      for (const e of livres) nova.add(e.id);
      return nova;
    });
    setLotando(true);
    const r = await repoLancamentosRevisar().classificarEmLote(livres);
    for (const e of livres) emCurso.current.delete(e.id);
    setOcupados((s) => {
      const nova = new Set(s);
      for (const e of livres) nova.delete(e.id);
      return nova;
    });
    setLotando(false);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return false;
    }
    // Nada mudou (já estava assim): nada a avisar.
    if (r.gravadas === 0) return true;
    void propagar(parcelasDoLote(r), false);
    toast.mostrar({
      texto: semSugestao > 0 ? rotuloClassificadosSemSugestao(r.gravadas, semSugestao) : rotuloClassificados(r.gravadas),
      aoDesfazer: () => {
        void repoLancamentosRevisar()
          .desfazerLote(r.antes)
          .then((d) => {
            if (!d.ok) toast.mostrar({ texto: mensagem(d.codigo) });
          });
      },
    });
    return true;
  }

  /** "Remover previsto": exclui o previsto que a Fatura não trouxe, com "Desfazer". */
  async function removerPrevisto(item: ItemDaFila) {
    if (emCurso.current.has(item.id)) return;
    emCurso.current.add(item.id);
    setOcupados((s) => new Set(s).add(item.id));
    const r = await repoLancamentosRevisar().excluir(item.id);
    emCurso.current.delete(item.id);
    setOcupados((s) => {
      const nova = new Set(s);
      nova.delete(item.id);
      return nova;
    });
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return;
    }
    toast.mostrar({
      texto: item.variante === "sumiu" ? T.linha_excluida : T.previsto_removido,
      aoDesfazer: () => {
        void repoLancamentosRevisar()
          .restaurar(item.id)
          .then((d) => {
            if (!d.ok) toast.mostrar({ texto: mensagem(d.codigo) });
          });
      },
    });
  }

  /** "Manter": o previsto sai da fila e continua previsto (sem Regra), com "Desfazer". */
  async function manterPrevisto(item: ItemDaFila) {
    const atual = fila.linhas.find((l) => l.id === item.id);
    if (!atual || emCurso.current.has(item.id)) return;
    emCurso.current.add(item.id);
    const anterior: AnteriorDaFila = {
      responsavel_id: atual.responsavel_id,
      tipo_id: atual.tipo_id,
      revisao_motivo: atual.revisao_motivo,
      revisao_dados: atual.revisao_dados,
      revisado_em: atual.revisado_em,
    };
    setOcupados((s) => new Set(s).add(item.id));
    const r = await repoLancamentosRevisar().manterPrevisto(item.id);
    emCurso.current.delete(item.id);
    setOcupados((s) => {
      const nova = new Set(s);
      nova.delete(item.id);
      return nova;
    });
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return;
    }
    toast.mostrar({
      texto: item.variante === "sumiu" ? T.linha_mantida : T.previsto_mantido,
      aoDesfazer: () => {
        void repoLancamentosRevisar()
          .devolverAFila(item.id, anterior)
          .then((d) => {
            if (!d.ok) toast.mostrar({ texto: mensagem(d.codigo) });
          });
      },
    });
  }

  function aplicarSugestoes() {
    const { entradas, semSugestao } = entradasDeSugestoes(itens.filter((i) => marcados.has(i.id)));
    if (entradas.length === 0) {
      toast.mostrar({ texto: T.nenhuma_sugestao_completa });
      return;
    }
    void aplicarEntradas(entradas, semSugestao);
  }

  function aplicarCadastro(campo: "responsavel" | "tipo", id: string): Promise<boolean> {
    const campos = campo === "responsavel" ? { responsavel_id: id } : { tipo_id: id };
    return aplicarEntradas(idsDaFila.filter((i) => marcados.has(i)).map((i) => ({ id: i, campos })));
  }

  let conteudo;
  if (erro) {
    conteudo = (
      <ErroAoCarregar
        aoTentarDeNovo={() => {
          void gerenciadorFila().recarregar();
          void gerenciador("responsaveis").recarregar();
          void gerenciador("tipos").recarregar();
        }}
      />
    );
  } else if (carregando) {
    conteudo = <EsqueletoRevisar />;
  } else if (grupos.length === 0) {
    conteudo = <EstadoVazio texto={T.tudo_revisado} />;
  } else {
    conteudo = (
      <div aria-label={T.lista} role="group" className="rounded-lg border border-border bg-surface">
        <div className="flex items-center border-b border-border-subtle px-3.5">
          <CaixaLote
            rotulo={T.selecionar_todos}
            texto={T.selecionar_todos}
            estado={estadoCaixaCabecalho(marcados, idsDaFila)}
            aoMudar={() => setSelecao(alternarTodos(marcados, idsDaFila))}
          />
        </div>
        {grupos.map((g) => (
          <section key={g.chave}>
            {g.titulo ? (
              <div className="flex items-center gap-3 px-3.5 pt-1">
                <div className="w-7.5 shrink-0">
                  <CaixaLote
                    rotulo={rotuloSelecionarGrupo(g.itens[0].nomeOriginal)}
                    estado={estadoCaixaCabecalho(
                      marcados,
                      g.itens.filter((i) => i.selecionavel).map((i) => i.id),
                    )}
                    aoMudar={() =>
                      setSelecao(
                        alternarTodos(
                          marcados,
                          g.itens.filter((i) => i.selecionavel).map((i) => i.id),
                        ),
                      )
                    }
                  />
                </div>
                <h2 className="texto-label text-text-muted">{g.titulo}</h2>
              </div>
            ) : null}
            <ul>
              {g.itens.map((item) => (
                <ItemRevisar
                  key={item.id}
                  item={item}
                  comMes={resumo.variosMeses}
                  ocupado={ocupados.has(item.id)}
                  marcado={marcados.has(item.id)}
                  aoMarcar={(i) => setSelecao(alternarSelecao(marcados, i.id))}
                  aoConfirmar={(i) => {
                    if (i.aoConfirmar) void classificar(i, i.aoConfirmar);
                  }}
                  aoMudar={(i) => setMudando(i)}
                  aoRemoverPrevisto={(i) => void removerPrevisto(i)}
                  aoManterPrevisto={(i) => void manterPrevisto(i)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <Tela
      titulo={titulo}
      acoes={
        !erro && !carregando && resumo.faltam > 0 ? (
          <span
            role="status"
            className="rounded-full bg-status-unpaid-bg px-3 py-1 texto-body-strong text-status-unpaid-fg"
          >
            {rotuloFaltam(resumo.faltam)}
          </span>
        ) : null
      }
    >
      {faixa && !erro ? (
        <p className="rounded-lg border border-border bg-surface p-3 texto-body">{faixa}</p>
      ) : null}
      {aPerguntar.length > 0 ? (
        <FaixaPergunta
          pergunta={perguntaAplicarAosPrevistos(aPerguntar.length)}
          aoResponder={(resposta) => void responderPrevistos(resposta)}
        />
      ) : null}
      {conteudo}
      {marcados.size > 0 && !erro ? (
        <>
          {/* Folga para a barra de lote não cobrir o fim da lista. */}
          <div aria-hidden style={{ height: "var(--altura-barra-inferior, 5rem)" }} />
          <BarraLote
            quantidade={marcados.size}
            totalCentavos={totalMarcados}
            ocupado={lotando || ocupados.size > 0}
            aoLimpar={() => setSelecao(new Set())}
            aoEscolherResponsavel={() => setJanelaLote("responsavel")}
            aoEscolherTipo={() => setJanelaLote("tipo")}
            aoAplicarSugestoes={aplicarSugestoes}
          />
        </>
      ) : null}
      {janelaLote !== null && marcados.size > 0 ? (
        <JanelaLote
          key={janelaLote}
          campo={janelaLote}
          quantidade={marcados.size}
          cadastros={janelaLote === "responsavel" ? responsaveisDaJanela : tiposDaJanela}
          aberta
          aoMudar={(aberta) => {
            if (!aberta) setJanelaLote(null);
          }}
          aoAplicar={(id) => aplicarCadastro(janelaLote, id)}
        />
      ) : null}
      {itemAberto ? (
        <JanelaMudar
          key={itemAberto.id}
          item={itemAberto}
          responsaveis={responsaveisDaJanela}
          tipos={tiposDaJanela}
          aberta
          aoMudar={(aberta) => {
            if (!aberta) setMudando(null);
          }}
          aoSalvar={classificar}
        />
      ) : null}
    </Tela>
  );
}
