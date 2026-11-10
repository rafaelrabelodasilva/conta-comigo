"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { conferir } from "@/domain/conferencia";
import {
  TEXTOS_REVISAR as T,
  mensagem,
  rotuloFaixaImportacao,
  rotuloFaltam,
  rotuloSeloConferencia,
} from "@/domain/mensagens";
import { ativos as responsaveisAtivos } from "@/domain/responsaveis";
import { montarFila, resumoDaFila, resumoDaImportacao, type ItemDaFila } from "@/domain/revisar";
import { ativos as tiposAtivos } from "@/domain/tipos";
import { repoLancamentosRevisar, type AnteriorDaFila } from "@/data/lancamentos-repo";
import { gerenciador, gerenciadorFila, useFilaRevisar, useLinhas } from "@/data/realtime";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { Tela } from "@/ui/Tela";
import { useToast } from "@/ui/Toast";
import { ItemRevisar } from "./ItemRevisar";
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
  // Numa ref: dois toques seguidos veem o mesmo estado e gravam uma vez só.
  const emCurso = useRef(new Set<string>());
  // O item aberto no "Mudar" (cópia de quando abriu).
  const [mudando, setMudando] = useState<ItemDaFila | null>(null);

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
  const itens = grupos.flatMap((g) => g.itens);
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
    const paraRevisar = itens.filter((i) => i.mes === fatura.mes).length;
    return rotuloFaixaImportacao(fatura.mes, rotuloSeloConferencia(conferencia), resumoDaImportacao(doMes, fatura.id, paraRevisar));
  }, [fatura, lancamentos.status, lancamentos.mes, lancamentos.linhas, cartoes.status, cartoes.linhas, itens]);

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
        {grupos.map((g) => (
          <section key={g.chave}>
            {g.titulo ? <h2 className="px-3.5 pt-3 pb-1 texto-label text-text-muted">{g.titulo}</h2> : null}
            <ul>
              {g.itens.map((item) => (
                <ItemRevisar
                  key={item.id}
                  item={item}
                  comMes={resumo.variosMeses}
                  ocupado={ocupados.has(item.id)}
                  aoConfirmar={(i) => {
                    if (i.aoConfirmar) void classificar(i, i.aoConfirmar);
                  }}
                  aoMudar={(i) => setMudando(i)}
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
      {conteudo}
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
