"use client";

import type { ReactNode } from "react";
import { formatarDinheiro } from "@/domain/dinheiro";
import {
  ROTULO_ATRASADO,
  TEXTOS_LANCAMENTO,
  TEXTOS_PAGAMENTO,
  TEXTOS_RECEBIMENTOS as T,
  rotuloAtrasadoDesde,
  rotuloFalta,
  rotuloListaEmAberto,
  rotuloMarcarEmAberto,
  rotuloMesDaLista,
  rotuloParteDoBloco,
} from "@/domain/mensagens";
import { nomeExibido } from "@/domain/painel";
import type { GrupoDoMes, ItemDaLista } from "@/domain/recebimentos";
import type { LinhaLancamento } from "@/data/lancamentos-repo";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { classesPessoa } from "@/ui/cores-pessoa";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { SeloStatus } from "@/ui/SeloStatus";

// A lista "Ver" de um Bloco de cobrança (História 6.5, FR-26, UX-DR22): os Lançamentos em aberto, agrupados
// por Mês (do mais novo para o mais antigo), cada um com o que FALTA receber (`restante`, AD-10: um "Pago
// parcialmente" mostra só o que falta). A Seleção é a do Painel (caixas, "selecionar todos" e a barra), mas
// junta Meses: ela é um conjunto de ids de uma lista só e some ao fechar a lista ou trocar de Bloco. O Ajuste
// de centavos fica sob a parcela dele (sem caixa); o crédito de algo pago e depois excluído (AD-11) é uma
// linha só de leitura. Tudo o que a lista diz vem do núcleo (`listaEmAberto`): ela só desenha.

const SEM_PARTES: ReadonlyMap<string, number> = new Map();

export type CadastrosDaLista = {
  responsaveis: ReadonlyMap<string, { nome: string; cor: number }>;
};

function SeloDaLinha({ item, atrasadoDesde }: { item: ItemDaLista<LinhaLancamento>; atrasadoDesde: string | undefined }) {
  const parcial = item.pendente.recebidoCentavos > 0 && !item.pendente.credito;
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {parcial ? <SeloStatus variante="parcial">{TEXTOS_PAGAMENTO.pago_parcialmente}</SeloStatus> : null}
      {atrasadoDesde !== undefined ? (
        <SeloStatus variante="atrasado" title={rotuloAtrasadoDesde(atrasadoDesde)}>
          {ROTULO_ATRASADO}
        </SeloStatus>
      ) : null}
      {!parcial && atrasadoDesde === undefined ? <SeloStatus variante="nao_pago">{T.selo_nao_pago}</SeloStatus> : null}
    </span>
  );
}

function Linha({
  item,
  nomeDoBloco,
  partes,
  cadastros,
  atrasos,
  selecao,
  aoAlternar,
  ajuste = false,
}: {
  item: ItemDaLista<LinhaLancamento>;
  nomeDoBloco: string;
  partes: ReadonlyMap<string, number>;
  cadastros: CadastrosDaLista;
  atrasos: ReadonlyMap<string, string>;
  selecao: ReadonlySet<string>;
  aoAlternar: (id: string) => void;
  ajuste?: boolean;
}): ReactNode {
  const { lancamento: l, pendente: p } = item;
  const nome = nomeExibido(l);
  const restante = formatarDinheiro(p.restanteCentavos);
  const dono = p.responsavel_id === null ? undefined : cadastros.responsaveis.get(p.responsavel_id);
  const parcial = p.recebidoCentavos > 0 && !p.credito;
  const desde = atrasos.get(l.id);
  const rotuloDoValor = parcial ? rotuloFalta(p.restanteCentavos) : restante;
  // A parte do Bloco (Rangel: Casal ÷ 2) só aparece quando difere do valor cheio da linha.
  const parte = p.credito ? undefined : partes.get(l.id);
  const comParte = parte !== undefined && parte !== p.restanteCentavos;
  const conteudo = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn("min-w-0 truncate", ajuste ? "texto-caption text-text-muted" : "texto-body")}>
            {ajuste ? `↳ ${T.ajuste}: ${nome}` : nome}
          </span>
          {dono ? (
            <span className={cn("rounded-full px-2 texto-label", classesPessoa(dono.cor).etiqueta)}>{dono.nome}</span>
          ) : (
            <span className="rounded-full bg-border-subtle px-2 texto-label text-text-muted">{T.sem_responsavel}</span>
          )}
        </span>
        {p.credito ? <span className="texto-caption text-text-muted">{T.linha_de_credito}</span> : null}
      </span>
      {p.credito ? null : <SeloDaLinha item={item} atrasadoDesde={desde} />}
      <span className="flex min-w-[5.5rem] flex-col items-end text-right">
        <span className="texto-number tabular-nums">{rotuloDoValor}</span>
        {comParte ? <span className="texto-caption tabular-nums text-text-muted">{rotuloParteDoBloco(nomeDoBloco, parte)}</span> : null}
      </span>
    </>
  );
  if (p.credito || ajuste) {
    return (
      <li className={cn("flex min-h-toque items-center gap-3 px-3.5 py-1", ajuste && "pl-12")}>
        {p.credito ? <span aria-hidden className="size-6 shrink-0" /> : null}
        {conteudo}
      </li>
    );
  }
  return (
    <li>
      <label className="flex min-h-toque cursor-pointer items-center gap-3 px-3.5 py-1.5">
        <input
          type="checkbox"
          aria-label={rotuloMarcarEmAberto(nome, rotuloDoValor)}
          checked={selecao.has(l.id)}
          onChange={() => aoAlternar(l.id)}
          className="size-5 shrink-0 cursor-pointer accent-accent"
        />
        {conteudo}
      </label>
      {item.ajustes.length > 0 ? (
        <ul>
          {item.ajustes.map((a) => (
            <Linha
              key={a.pendente.id}
              item={a}
              nomeDoBloco={nomeDoBloco}
              partes={partes}
              cadastros={cadastros}
              atrasos={atrasos}
              selecao={selecao}
              aoAlternar={aoAlternar}
              ajuste
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ListaEmAberto({
  nomeDoBloco,
  grupos,
  partes = SEM_PARTES,
  cadastros,
  atrasos,
  selecao,
  todosMarcados,
  aoAlternar,
  aoAlternarTodos,
  aoFechar,
}: {
  nomeDoBloco: string;
  grupos: readonly GrupoDoMes<LinhaLancamento>[];
  /** Quanto de cada linha é do Bloco (`partesDoBloco`); ausente, nenhuma linha mostra "parte do". */
  partes?: ReadonlyMap<string, number>;
  cadastros: CadastrosDaLista;
  atrasos: ReadonlyMap<string, string>;
  selecao: ReadonlySet<string>;
  todosMarcados: boolean;
  aoAlternar: (id: string) => void;
  aoAlternarTodos: () => void;
  aoFechar: () => void;
}) {
  const titulo = rotuloListaEmAberto(nomeDoBloco);
  const vazia = grupos.length === 0;
  return (
    <section aria-label={titulo} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <header className="flex min-h-toque flex-wrap items-center gap-3">
        <h3 className="flex-1 texto-body-strong">{titulo}</h3>
        {vazia ? null : (
          <label className="inline-flex min-h-toque cursor-pointer items-center gap-2 texto-body">
            <input
              type="checkbox"
              checked={todosMarcados}
              onChange={aoAlternarTodos}
              className="size-5 cursor-pointer accent-accent"
            />
            {TEXTOS_LANCAMENTO.selecionar_todos}
          </label>
        )}
        <Botao onClick={aoFechar}>{T.fechar_lista}</Botao>
      </header>
      {vazia ? (
        <EstadoVazio texto={T.nada_em_aberto} className="p-4" />
      ) : (
        <>
          <p className="texto-caption text-text-muted">{T.nota_da_formula}</p>
          {grupos.map((g) => {
            const n = g.itens.filter((i) => !i.pendente.credito).length;
            return (
              <div key={g.mes} className="flex flex-col">
                <h4 className="border-b border-border-subtle px-3.5 py-1 texto-label text-text-muted">
                  {rotuloMesDaLista(g.mes, n)}
                </h4>
                <ul className="flex flex-col">
                  {g.itens.map((i) => (
                    <Linha
                      key={i.pendente.id}
                      item={i}
                      nomeDoBloco={nomeDoBloco}
                      partes={partes}
                      cadastros={cadastros}
                      atrasos={atrasos}
                      selecao={selecao}
                      aoAlternar={aoAlternar}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
