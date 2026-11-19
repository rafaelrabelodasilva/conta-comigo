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

/** Para onde o foco vai depois de marcar: o botão do próximo não lido, ou a própria lista. */
const FOCO_NA_LISTA = "lista";

export function Avisos() {
  const estado = useCentralDeAvisos();
  const toast = useToast();
  const [marcandoTudo, setMarcandoTudo] = useState(false);
  const [tudoMarcado, setTudoMarcado] = useState(false);
  // Para onde o foco vai quando a lista mudar por causa de uma marcação (um ref: não é estado de tela).
  const focoPendente = useRef<string | null>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  const central = estado.status === "pronto" ? estado.central : null;

  // Depois de marcar, devolve o foco (o botão que tinha o foco sumiu da linha).
  useEffect(() => {
    const alvo = focoPendente.current;
    if (alvo === null) return;
    focoPendente.current = null;
    const lista = listaRef.current;
    const botao = Array.from(lista?.querySelectorAll<HTMLElement>("[data-marcar]") ?? []).find(
      (b) => b.dataset.marcar === alvo,
    );
    (botao ?? lista)?.focus();
  }, [central]);

  async function marcarUm(avisos: readonly AvisoDaCentral[], aviso: AvisoDaCentral) {
    const chave = textoDaChaveDeNotificacao(aviso.chave);
    // O foco vai para o próximo não lido (depois deste, ou o primeiro que sobrar) ou, sem nenhum, para a lista.
    const outros = avisos.filter((a) => !a.lido && textoDaChaveDeNotificacao(a.chave) !== chave);
    const indice = avisos.indexOf(aviso);
    const proximo = outros.find((a) => avisos.indexOf(a) > indice) ?? outros[0];
    focoPendente.current = proximo === undefined ? FOCO_NA_LISTA : textoDaChaveDeNotificacao(proximo.chave);
    const r = await repoAvisos().marcarUm(aviso.chave);
    // Se nada mudou na lista (recusa, ou já estava lido), o foco fica onde estava.
    focoPendente.current = null;
    if (!r.ok) toast.mostrar({ texto: mensagem(r.codigo) });
  }

  async function marcarTudo(chaves: AvisoDaCentral["chave"][]) {
    setTudoMarcado(false);
    setMarcandoTudo(true);
    focoPendente.current = FOCO_NA_LISTA;
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

function LinhaDeAviso({ aviso, aoMarcar }: { aviso: AvisoDaCentral; aoMarcar: () => void }) {
  const { origem, lido } = aviso;
  const texto = textoDoAviso(origem);
  return (
    <li
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
        className="flex min-h-toque min-w-0 flex-1 items-center gap-3 px-3 py-1.5 text-text"
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
      {lido ? null : (
        <div className="flex items-center pr-2">
          <Botao
            variante="secundario"
            data-marcar={textoDaChaveDeNotificacao(aviso.chave)}
            aria-label={`${TEXTOS_AVISOS.marcar_um}: ${texto}`}
            onClick={aoMarcar}
          >
            {TEXTOS_AVISOS.marcar_um}
          </Botao>
        </div>
      )}
    </li>
  );
}
