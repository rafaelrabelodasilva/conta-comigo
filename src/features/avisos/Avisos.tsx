"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AvisoDaCentral } from "@/domain/avisos";
import { textoDaChaveDeNotificacao } from "@/domain/lembretes";
import {
  TEXTOS_AVISOS,
  mensagem,
  rotuloAcaoDoAviso,
  rotuloDeAvisosNovos,
  rotuloResumoDeAtrasos,
  textoDoAviso,
} from "@/domain/mensagens";
import { repoAvisos } from "@/data/avisos-repo";
import { repoFaturas } from "@/data/faturas-repo";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { useToast } from "@/ui/Toast";
import { recarregarCentralDeAvisos, useCentralDeAvisos } from "./use-central-de-avisos";

// A tela `/avisos`, a Central de Avisos (História 8.1 e 8.2, FR-55, EXPERIENCE.md "Lembretes" e "Avisos"): todos os
// avisos do dia, sem limite, não lidos primeiro: a diferença da Conferência de uma Fatura, a fila do Revisar, o
// fechamento da fatura e cada Bloco com itens atrasados. Cada linha diz o que é, para onde leva ("Abrir o Painel",
// "Abrir Revisar", "Abrir Recebimentos") e o estado em texto ("Novo" ou "Lido", nunca só cor ou negrito). Tocar na linha
// abre o destino e marca como lido; "Marcar como lido" marca sem sair; "Marcar tudo como lido" é um pedido só.
// Quais avisos existem, a ordem, o "lido" e a contagem são do núcleo (`avisosDaCentral`); aqui só se desenha.
//
// - Carregando e erro como as outras telas (`Esqueleto`, `ErroAoCarregar`). A leitura dos lidos que falha não é
//   erro: tudo aparece como Novo (ver `use-central-de-avisos.ts`).
// - Acessibilidade: o resumo do topo é `role="status"` (o contador muda sem roubar o foco) e o resultado de "Marcar
//   tudo" é anunciado numa região `status` própria. Ao marcar uma linha, a linha vai para o fim dos lidos e o foco
//   passa ao "Marcar como lido" do próximo não lido; sem nenhum, vai para a lista (que aceita foco): nunca se perde.
// - Marcar ao abrir o destino não mostra erro: a pessoa pediu para abrir, não para marcar; o aviso segue Novo.
// - "Dispensar" (8.3, só na Conferência, lida ou não): a MESMA gravação da faixa do Painel (`dispensarAlerta`, que grava
//   `alerta_dispensado_em` na Fatura) e o mesmo toast "Alerta dispensado · Desfazer" (`desfazerDispensa`). Dispensar pela
//   Central ou pelo Painel é a mesma coisa: a faixa some e o aviso some, e o "Desfazer" traz os dois de volta. "Lido" e
//   "dispensado" são coisas diferentes: lido é "vi" (a linha fica, em Lido); dispensado é "não quero mais ser avisado desta
//   Fatura" (a linha sai). A linha some, então o foco vai para a linha seguinte (ou a anterior, se era a última; sem
//   nenhuma, para a lista): o primeiro botão ou link dela. Quem desliga o aviso do Revisar é o interruptor em
//   Configurações (o aviso é um só, sobre a fila: não há o que dispensar).

/** Para onde o foco vai depois de marcar: o botão do próximo não lido, ou a própria lista. */
const FOCO_NA_LISTA = "lista";

/** Onde o foco cai depois de uma mudança na lista: o "Marcar como lido" de uma linha ou o primeiro controle dela. */
type FocoPendente = { chave: string; alvo: "marcar" | "linha" };

export function Avisos() {
  const estado = useCentralDeAvisos();
  const toast = useToast();
  const [marcandoTudo, setMarcandoTudo] = useState(false);
  const [tudoMarcado, setTudoMarcado] = useState(false);
  // Para onde o foco vai quando a lista mudar por causa de uma marcação (um ref: não é estado de tela).
  const focoPendente = useRef<FocoPendente | null>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  const central = estado.status === "pronto" ? estado.central : null;

  // Depois de marcar, devolve o foco (o botão que tinha o foco sumiu da linha).
  useEffect(() => {
    const alvo = focoPendente.current;
    if (alvo === null) return;
    focoPendente.current = null;
    const lista = listaRef.current;
    let destino: HTMLElement | undefined;
    if (alvo.alvo === "marcar") {
      destino = Array.from(lista?.querySelectorAll<HTMLElement>("[data-marcar]") ?? []).find(
        (b) => b.dataset.marcar === alvo.chave,
      );
    } else {
      const linha = Array.from(lista?.querySelectorAll<HTMLElement>("[data-linha]") ?? []).find(
        (l) => l.dataset.linha === alvo.chave,
      );
      destino = linha?.querySelector<HTMLElement>("button, a") ?? undefined;
    }
    (destino ?? lista)?.focus();
  }, [central]);

  async function marcarUm(avisos: readonly AvisoDaCentral[], aviso: AvisoDaCentral) {
    const chave = textoDaChaveDeNotificacao(aviso.chave);
    // O foco vai para o próximo não lido (depois deste, ou o primeiro que sobrar) ou, sem nenhum, para a lista.
    const outros = avisos.filter((a) => !a.lido && textoDaChaveDeNotificacao(a.chave) !== chave);
    const indice = avisos.indexOf(aviso);
    const proximo = outros.find((a) => avisos.indexOf(a) > indice) ?? outros[0];
    focoPendente.current = {
      chave: proximo === undefined ? FOCO_NA_LISTA : textoDaChaveDeNotificacao(proximo.chave),
      alvo: "marcar",
    };
    const r = await repoAvisos().marcarUm(aviso.chave);
    // Se nada mudou na lista (recusa, ou já estava lido), o foco fica onde estava.
    focoPendente.current = null;
    if (!r.ok) toast.mostrar({ texto: mensagem(r.codigo) });
  }

  /** "Dispensar" a Conferência de uma Fatura: o mesmo que a faixa do Painel faz, com o mesmo toast e o mesmo "Desfazer". */
  async function dispensar(avisos: readonly AvisoDaCentral[], aviso: AvisoDaCentral) {
    if (aviso.origem.tipo !== "conferencia") return;
    const faturaId = aviso.origem.faturaId;
    // O foco vai para a linha seguinte (ou a anterior, se esta era a última) ou, sem nenhuma, para a lista.
    const indice = avisos.indexOf(aviso);
    const vizinha = avisos[indice + 1] ?? avisos[indice - 1];
    focoPendente.current = {
      chave: vizinha === undefined ? FOCO_NA_LISTA : textoDaChaveDeNotificacao(vizinha.chave),
      alvo: "linha",
    };
    const r = await repoFaturas().dispensarAlerta(faturaId);
    // Se nada mudou na lista (recusa), o foco fica onde estava.
    focoPendente.current = null;
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return;
    }
    toast.mostrar({
      texto: TEXTOS_AVISOS.alerta_dispensado,
      aoDesfazer: () => {
        void repoFaturas()
          .desfazerDispensa(faturaId)
          .then((d) => {
            if (!d.ok) toast.mostrar({ texto: mensagem(d.codigo) });
          });
      },
    });
  }

  async function marcarTudo(chaves: AvisoDaCentral["chave"][]) {
    setTudoMarcado(false);
    setMarcandoTudo(true);
    focoPendente.current = { chave: FOCO_NA_LISTA, alvo: "marcar" };
    const r = await repoAvisos().marcar(chaves);
    focoPendente.current = null;
    setMarcandoTudo(false);
    if (r.ok) setTudoMarcado(true);
    else toast.mostrar({ texto: mensagem(r.codigo) });
  }

  let conteudo;
  if (estado.status === "erro") {
    conteudo = <ErroAoCarregar aoTentarDeNovo={recarregarCentralDeAvisos} />;
  } else if (central === null) {
    conteudo = (
      <div role="status" aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">{TEXTOS_AVISOS.carregando}</span>
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-toque" />
        ))}
      </div>
    );
  } else if (central.avisos.length === 0) {
    conteudo = <EstadoVazio texto={TEXTOS_AVISOS.vazio} />;
  } else {
    conteudo = (
      <ul
        ref={listaRef}
        tabIndex={-1}
        aria-label={TEXTOS_AVISOS.lista}
        className="flex flex-col gap-2 outline-none focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        {central.avisos.map((aviso) => (
          <LinhaDeAviso
            key={textoDaChaveDeNotificacao(aviso.chave)}
            aviso={aviso}
            aoMarcar={() => void marcarUm(central.avisos, aviso)}
            aoDispensar={() => void dispensar(central.avisos, aviso)}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* O resumo do topo: o contador muda aqui sem roubar o foco (o menu todo não é uma região `status`). */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="status" className="flex min-w-0 flex-1 flex-col">
          {central !== null && central.avisos.length > 0 ? (
            <>
              <p className="texto-body-strong">{rotuloDeAvisosNovos(central.naoLidos)}</p>
              {central.blocosAtrasados > 0 ? (
                <p className="texto-caption text-text-muted">{rotuloResumoDeAtrasos(central.blocosAtrasados)}</p>
              ) : null}
            </>
          ) : null}
        </div>
        <Botao
          variante="secundario"
          disabled={central === null || central.naoLidos === 0 || marcandoTudo}
          aria-busy={marcandoTudo || undefined}
          onClick={() => central !== null && void marcarTudo(central.chavesNaoLidas)}
        >
          {marcandoTudo ? TEXTOS_AVISOS.marcando_tudo : TEXTOS_AVISOS.marcar_tudo}
        </Botao>
      </div>
      {/* Anuncia o resultado de "Marcar tudo como lido" (sempre montada, para o leitor de tela ouvir o que entra). */}
      <p role="status" className="sr-only">
        {tudoMarcado && central !== null && central.naoLidos === 0 ? TEXTOS_AVISOS.todos_lidos : ""}
      </p>
      {conteudo}
    </div>
  );
}

function LinhaDeAviso({
  aviso,
  aoMarcar,
  aoDispensar,
}: {
  aviso: AvisoDaCentral;
  aoMarcar: () => void;
  aoDispensar: () => void;
}) {
  const { origem, lido } = aviso;
  const texto = textoDoAviso(origem);
  // Só a Conferência pode ser dispensada (lida ou não); só quem não foi lido tem "Marcar como lido".
  const podeDispensar = origem.tipo === "conferencia";
  const temAcoes = !lido || podeDispensar;
  return (
    <li
      data-linha={textoDaChaveDeNotificacao(aviso.chave)}
      className={cn(
        "flex flex-wrap items-stretch gap-x-2 rounded-lg border",
        lido ? "border-border bg-surface" : "border-alert-warning-border bg-alert-warning-bg",
      )}
    >
      {/* Tocar abre o destino e marca como lido (sem erro se não der: a pessoa pediu para abrir). */}
      <Link
        href={origem.destino}
        onClick={() => {
          if (!lido) void repoAvisos().marcarUm(aviso.chave);
        }}
        className={cn(
          "flex min-h-toque min-w-0 flex-1 items-center gap-3 px-3 py-1.5 text-text",
          // Com dois botões ao lado, o texto precisa de espaço para ler (o iPad em pé tem 834 pt): abaixo desta largura
          // os botões descem para a linha de baixo, em vez de espremer o texto.
          podeDispensar && "basis-72",
        )}
      >
        <span
          className={cn(
            "shrink-0 rounded-sm border px-2 texto-label",
            lido ? "border-border text-text-muted" : "border-alert-warning-border text-text",
          )}
        >
          {lido ? TEXTOS_AVISOS.estado_lido : TEXTOS_AVISOS.estado_novo}
        </span>
        <span className={cn("min-w-0 flex-1", lido ? "texto-body text-text-muted" : "texto-body-strong")}>{texto}</span>
        <span className="shrink-0 texto-label underline">{rotuloAcaoDoAviso(origem)}</span>
      </Link>
      {temAcoes ? (
        <div className={cn("flex items-center pr-2", podeDispensar && "flex-wrap gap-2 pb-1.5 pl-3")}>
          {lido ? null : (
            <Botao
              variante="secundario"
              data-marcar={textoDaChaveDeNotificacao(aviso.chave)}
              aria-label={`${TEXTOS_AVISOS.marcar_um}: ${texto}`}
              onClick={aoMarcar}
            >
              {TEXTOS_AVISOS.marcar_um}
            </Botao>
          )}
          {podeDispensar ? (
            <Botao variante="secundario" aria-label={`${TEXTOS_AVISOS.dispensar}: ${texto}`} onClick={aoDispensar}>
              {TEXTOS_AVISOS.dispensar}
            </Botao>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
