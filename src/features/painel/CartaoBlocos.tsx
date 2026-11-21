"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { moverNaOrdem } from "@/domain/blocos";
import {
  ROTULOS,
  TEXTOS_BLOCO as T,
  avisoCadastrosArquivados,
  rotuloAcoesDoBloco,
  rotuloArrastarBloco,
  rotuloFiltrarPeloBloco,
  rotuloMensagemDoBloco,
  rotuloMoverBloco,
} from "@/domain/mensagens";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { classesPessoa } from "@/ui/cores-pessoa";
import { Esqueleto } from "@/ui/Esqueleto";
import { MenuAcoes, useToqueLongo } from "@/ui/MenuAcoes";

// Cartão "Blocos" do Painel (UX-DR8, História 4.2, FR-19): cada Bloco é um
// `block-card` com a bolinha da pessoa (Bloco de um Responsável só), o valor,
// o subtítulo com a Fórmula legível e, embaixo, ⋯ (Editar fórmula, Ver
// cálculo, Gerar mensagem, Reordenar, Excluir; o toque longo no cartão abre o
// mesmo menu) e 💬 (Gerar mensagem, História 4.7: a forma 2; sem `aoGerarMensagem`,
// como no passo "Blocos" do Primeiro uso, nem o 💬 nem o item existem). Em
// "Reordenar" os cartões tremem de leve (só com movimento permitido) e podem
// ser arrastados pela alça; os botões de mover para antes e depois fazem o
// mesmo para quem não arrasta (VoiceOver, teclado). O valor muda no lugar: o
// cartão só recebe o texto pronto (`valor`) de quem calculou no núcleo.
//
// Filtrar a grade (História 4.3, FR-20): com `aoFiltrar`, o corpo do cartão é
// um botão `aria-pressed` que liga e desliga o filtro daquele Bloco (o ativo
// ganha a borda `accent-line` mais 1 px de contorno). O ⋯ e o 💬 são irmãos
// desse botão (posicionados por cima dele), nunca filhos: não há botão dentro
// de botão. O clique que vem logo depois do toque longo é engolido por
// `useToqueLongo`, então abrir o menu não filtra. Em "Reordenar" o toque não
// filtra (o corpo vira texto parado); sem valor, o cartão não filtra.

export type ItemDoCartaoBlocos = {
  id: string;
  nome: string;
  /** A Fórmula legível, com os parênteses como foram montados. */
  formula: string;
  /** O valor já formatado ("R$ 2.819,68"), ou "—" quando não há. */
  valor: string;
  /** A Fórmula não calcula: não há Lançamentos que entram, então o cartão não filtra. */
  semValor?: boolean;
  /**
   * Bloco de cobrança: o que falta receber dele neste Mês ("Falta R$ 120,00" ou "Nada a receber"), o mesmo número de
   * Recebimentos. `null`/ausente: não é de cobrança, ou os pagamentos ainda carregam.
   */
  falta?: string | null;
  incluiPrevistos: boolean;
  /** Cor (1..8) do Responsável de um Bloco de uma pessoa só; senão `null`. */
  corPessoa: number | null;
  /** Os cadastros arquivados que a Fórmula cita (aviso no cartão). */
  arquivados: readonly string[];
};

export type PropsCartaoBlocos = {
  itens: readonly ItemDoCartaoBlocos[];
  /** Os Blocos ainda estão sendo lidos (esqueleto só na primeira leitura). */
  carregando: boolean;
  /** A leitura dos Blocos falhou. */
  erro: boolean;
  reordenando: boolean;
  /** O Bloco que filtra a grade agora (borda em destaque), se algum. */
  ativoId?: string | null;
  /** Tocar no cartão filtra a grade por aquele Bloco. Sem isto, o cartão não filtra. */
  aoFiltrar?: (id: string) => void;
  aoNovo: () => void;
  aoTentarDeNovo: () => void;
  aoAlternarReordenar: () => void;
  aoEditar: (id: string) => void;
  aoVerCalculo: (id: string) => void;
  /** Gera a mensagem do Bloco (o 💬 e o item do ⋯). Sem isto, o cartão não oferece a mensagem. */
  aoGerarMensagem?: (id: string) => void;
  aoExcluir: (id: string) => void;
  /** Os Blocos na ordem nova (soltou o arrasto ou tocou em mover). */
  aoMudarOrdem: (ids: string[]) => void;
};

const BOTAO_ICONE =
  "area-toque inline-flex size-icone shrink-0 cursor-pointer items-center justify-center rounded-sm border border-border bg-surface text-text texto-body-strong disabled:cursor-not-allowed disabled:opacity-50";

type Arrasto = { id: string; ordem: string[] };

function BlocoCard({
  item,
  reordenando,
  ativo,
  aoFiltrar,
  posicao,
  total,
  registrar,
  aoEditar,
  aoVerCalculo,
  aoGerarMensagem,
  aoExcluir,
  aoReordenar,
  aoMover,
  aoComecarArrasto,
  aoArrastar,
  aoSoltar,
  aoCancelarArrasto,
  arrastando,
}: {
  item: ItemDoCartaoBlocos;
  reordenando: boolean;
  ativo: boolean;
  aoFiltrar?: () => void;
  posicao: number;
  total: number;
  registrar: (id: string, el: HTMLLIElement | null) => void;
  aoEditar: () => void;
  aoVerCalculo: () => void;
  aoGerarMensagem?: () => void;
  aoExcluir: () => void;
  aoReordenar: () => void;
  aoMover: (sentido: -1 | 1) => void;
  aoComecarArrasto: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  aoArrastar: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  aoSoltar: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  aoCancelarArrasto: () => void;
  arrastando: boolean;
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const abrirMenu = useCallback(() => setMenuAberto(true), []);
  const toqueLongo = useToqueLongo(abrirMenu);
  const filtra = !reordenando && aoFiltrar !== undefined;

  const corpo = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 texto-label text-text">
          {item.corPessoa !== null ? (
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", classesPessoa(item.corPessoa).fundo)} />
          ) : null}
          <span className="truncate">{item.nome}</span>
        </span>
        {reordenando ? (
          <button
            type="button"
            aria-label={rotuloArrastarBloco(item.nome)}
            onPointerDown={aoComecarArrasto}
            onPointerMove={aoArrastar}
            onPointerUp={aoSoltar}
            onPointerCancel={aoCancelarArrasto}
            className={cn(BOTAO_ICONE, "touch-none cursor-grab")}
          >
            <span aria-hidden>⠿</span>
          </button>
        ) : null}
      </div>
      <b className="texto-block-value text-text">{item.valor}</b>
      {item.falta ? <span className="texto-caption text-text-muted">{item.falta}</span> : null}
      {item.incluiPrevistos ? <span className="texto-caption text-forecast-fg">{T.inclui_previstos}</span> : null}
      {item.arquivados.length > 0 ? (
        <span className="texto-caption text-text-muted">{avisoCadastrosArquivados(item.arquivados)}</span>
      ) : null}
      {/* A Fórmula fica embaixo, à esquerda; o espaço da direita é dos botões (⋯ e 💬, ou ‹ ›). */}
      <span className="mt-auto min-h-icone break-words pr-16 pt-1 texto-caption text-text-muted">{item.formula}</span>
    </>
  );

  return (
    <li
      ref={(el) => registrar(item.id, el)}
      data-bloco-id={item.id}
      className={cn(
        "relative flex min-w-0 flex-col rounded-md border bg-background",
        reordenando ? "bloco-tremendo border-dashed border-accent-line" : "border-border",
        ativo && !reordenando && "border-accent-line ring-1 ring-accent-line",
        ativo && reordenando && "ring-1 ring-accent-line",
        arrastando && "opacity-60",
      )}
      {...(reordenando ? {} : toqueLongo)}
    >
      {filtra ? (
        <button
          type="button"
          aria-pressed={ativo}
          aria-label={rotuloFiltrarPeloBloco(item.nome, item.semValor ? null : item.valor)}
          disabled={item.semValor}
          onClick={aoFiltrar}
          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 rounded-md p-3 text-left select-none [-webkit-touch-callout:none] disabled:cursor-not-allowed"
        >
          {corpo}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">{corpo}</div>
      )}
      <span className="absolute right-3 bottom-3 flex shrink-0 items-center gap-1.5">
        {reordenando ? (
          <>
            <button
              type="button"
              aria-label={rotuloMoverBloco(item.nome, "antes")}
              disabled={posicao === 0}
              onClick={() => aoMover(-1)}
              className={BOTAO_ICONE}
            >
              <span aria-hidden>‹</span>
            </button>
            <button
              type="button"
              aria-label={rotuloMoverBloco(item.nome, "depois")}
              disabled={posicao === total - 1}
              onClick={() => aoMover(1)}
              className={BOTAO_ICONE}
            >
              <span aria-hidden>›</span>
            </button>
          </>
        ) : (
          <>
            <MenuAcoes
              rotulo={rotuloAcoesDoBloco(item.nome)}
              aberto={menuAberto}
              aoMudarAberto={setMenuAberto}
              itens={[
                { rotulo: T.editar_formula, aoEscolher: aoEditar },
                { rotulo: T.ver_calculo, aoEscolher: aoVerCalculo },
                ...(aoGerarMensagem ? [{ rotulo: T.gerar_mensagem, aoEscolher: aoGerarMensagem }] : []),
                { rotulo: T.reordenar, aoEscolher: aoReordenar },
                { rotulo: T.excluir_bloco, aoEscolher: aoExcluir, destrutivo: true },
              ]}
            />
            {aoGerarMensagem ? (
              <button
                type="button"
                aria-label={rotuloMensagemDoBloco(item.nome)}
                onClick={aoGerarMensagem}
                className={BOTAO_ICONE}
              >
                <span aria-hidden>💬</span>
              </button>
            ) : null}
          </>
        )}
      </span>
    </li>
  );
}

export function CartaoBlocos({
  itens,
  carregando,
  erro,
  reordenando,
  ativoId = null,
  aoFiltrar,
  aoNovo,
  aoTentarDeNovo,
  aoAlternarReordenar,
  aoEditar,
  aoVerCalculo,
  aoGerarMensagem,
  aoExcluir,
  aoMudarOrdem,
}: PropsCartaoBlocos) {
  const elementos = useRef(new Map<string, HTMLLIElement>());
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const registrar = useCallback((id: string, el: HTMLLIElement | null) => {
    if (el) elementos.current.set(id, el);
    else elementos.current.delete(id);
  }, []);

  const pronto = !carregando && !erro;
  // Enquanto arrasta, a ordem mostrada é a do arrasto; solto, volta a ser a dos Blocos.
  const mostrados = arrasto
    ? arrasto.ordem.map((id) => itens.find((i) => i.id === id)).filter((i): i is ItemDoCartaoBlocos => i !== undefined)
    : itens;

  /** O cartão sob o ponteiro (o dono do retângulo que o contém). */
  function idSob(x: number, y: number): string | null {
    for (const [id, el] of elementos.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
    }
    return null;
  }

  function comecar(id: string, e: ReactPointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setArrasto({ id, ordem: itens.map((i) => i.id) });
  }

  function arrastar(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!arrasto) return;
    const sob = idSob(e.clientX, e.clientY);
    if (sob === null || sob === arrasto.id) return;
    const de = arrasto.ordem.indexOf(arrasto.id);
    const para = arrasto.ordem.indexOf(sob);
    if (de < 0 || para < 0) return;
    setArrasto({ id: arrasto.id, ordem: moverNaOrdem(arrasto.ordem, de, para) });
  }

  function soltar(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!arrasto) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const ordem = arrasto.ordem;
    setArrasto(null);
    if (ordem.some((id, i) => id !== itens[i]?.id)) aoMudarOrdem(ordem);
  }

  function mover(id: string, sentido: -1 | 1) {
    const ids = itens.map((i) => i.id);
    const de = ids.indexOf(id);
    aoMudarOrdem(moverNaOrdem(ids, de, de + sentido));
  }

  return (
    <section aria-label={T.titulo_cartao} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="texto-title text-text">{T.titulo_cartao}</h2>
        <div className="flex items-center gap-2">
          {pronto && itens.length > 1 ? (
            <Botao tamanho="compacto" variante="secundario" onClick={aoAlternarReordenar}>
              {reordenando ? T.concluir_reordenar : T.reordenar}
            </Botao>
          ) : null}
          <Botao tamanho="compacto" variante="primario" disabled={!pronto || reordenando} onClick={aoNovo}>
            <span aria-hidden>＋</span>
            {T.novo}
          </Botao>
        </div>
      </div>
      {reordenando ? <p className="sr-only" role="status">{T.reordenando}</p> : null}
      {erro ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="texto-body text-text">{T.erro_carregar}</p>
          <Botao tamanho="compacto" variante="secundario" onClick={aoTentarDeNovo}>
            {ROTULOS.tentar_de_novo}
          </Botao>
        </div>
      ) : carregando ? (
        <div role="status" aria-busy="true" className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
          <span className="sr-only">{T.carregando}</span>
          {Array.from({ length: 3 }, (_, i) => (
            <Esqueleto key={i} className="h-24" />
          ))}
        </div>
      ) : itens.length === 0 ? (
        <p className="texto-body text-text-muted">{T.sem_blocos}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
          {mostrados.map((item, i) => (
            <BlocoCard
              key={item.id}
              item={item}
              reordenando={reordenando}
              ativo={ativoId === item.id}
              aoFiltrar={aoFiltrar ? () => aoFiltrar(item.id) : undefined}
              posicao={i}
              total={mostrados.length}
              registrar={registrar}
              aoEditar={() => aoEditar(item.id)}
              aoVerCalculo={() => aoVerCalculo(item.id)}
              aoGerarMensagem={aoGerarMensagem ? () => aoGerarMensagem(item.id) : undefined}
              aoExcluir={() => aoExcluir(item.id)}
              aoReordenar={aoAlternarReordenar}
              aoMover={(sentido) => mover(item.id, sentido)}
              aoComecarArrasto={(e) => comecar(item.id, e)}
              aoArrastar={arrastar}
              aoSoltar={soltar}
              aoCancelarArrasto={() => setArrasto(null)}
              arrastando={arrasto?.id === item.id}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
