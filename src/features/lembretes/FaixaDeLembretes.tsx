"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  DESTINO_DO_LEMBRETE_DE_ATRASO,
  lembretesDasLinhas,
  lembretesParaExibir,
  type Lembrete,
} from "@/domain/lembretes";
import { TEXTOS_LEMBRETES, rotuloAcaoDoLembrete, rotuloMaisAtrasos, textoDoLembrete } from "@/domain/mensagens";
import { configuracoesDoDono } from "@/data/configuracoes-repo";
import { useItensDoHistorico, useLinhas, useTodosOsLancamentos } from "@/data/realtime";
import { useHoje } from "@/ui/use-hoje";

// A faixa de lembretes dentro do app (História 7.4, FR-55, EXPERIENCE.md "Lembretes"). Mora no layout das
// telas autenticadas, logo abaixo da faixa "Sem conexão", então aparece em todas elas (menos no Primeiro uso,
// que tem layout próprio). Cada lembrete é um toque de 44 pt que abre o Painel do Mês ou Recebimentos; o
// texto sempre diz o que é e para onde leva (nunca só cor ou ícone). Nada é gravado: a faixa é calculada a
// cada desenho por `lembretesDoDia` (núcleo), com os MESMOS dados e a mesma conta de atraso da grade e de
// Recebimentos (`atrasosDasLinhas`), lidos dos gerenciadores de Realtime que as telas já usam (AD-4).
//
// - Carregando ou com erro (qualquer das sete leituras ainda sem dados): não mostra nada, nem esqueleto nem
//   erro. Quem avisa de erro é a tela de cada dado; a faixa é um aviso a mais e nunca pode piscar nem
//   aparecer errada com dados pela metade. Perdendo a conexão depois de carregar, os dados em memória
//   seguem valendo (o gerenciador mantém a lista) e a faixa continua.
// - O contêiner `role="status"` fica sempre montado (o leitor de tela anuncia o que entra) e nada aqui
//   rouba o foco.
// - O dia vem de `useHoje`: com a tela aberta na virada da meia-noite, a faixa recalcula sozinha.

export function FaixaDeLembretes() {
  const todos = useTodosOsLancamentos();
  const itens = useItensDoHistorico();
  const blocosLidos = useLinhas("blocos");
  const status = useLinhas("status");
  const faturas = useLinhas("faturas");
  const ciclo = useLinhas("config_ciclo");
  const configuracoes = useLinhas("configuracoes");
  const hoje = useHoje();

  const pronto = [todos, itens, blocosLidos, status, faturas, ciclo, configuracoes].every((r) => r.status === "pronto");

  const lembretes = useMemo<Lembrete[]>(() => {
    if (!pronto) return [];
    // A mesma função que o Cron usa (`lembretesDasLinhas`): o aviso do sistema nunca diverge da faixa (AD-10).
    return lembretesDasLinhas(hoje, {
      ciclo: ciclo.linhas,
      lancamentos: todos.linhas,
      blocos: blocosLidos.linhas,
      status: status.linhas,
      itens: itens.linhas,
      faturas: faturas.linhas,
      configuracao: configuracoesDoDono(configuracoes.linhas),
    });
  }, [pronto, hoje, ciclo.linhas, todos.linhas, blocosLidos.linhas, configuracoes.linhas, status.linhas, itens.linhas, faturas.linhas]);

  const { visiveis, maisAtrasos } = useMemo(() => lembretesParaExibir(lembretes), [lembretes]);

  return (
    <div role="status" aria-label={TEXTOS_LEMBRETES.regiao} className="shrink-0">
      {visiveis.map((lembrete) => (
        <Faixa key={`${lembrete.tipo}:${lembrete.referencia}`} href={lembrete.destino} acao={rotuloAcaoDoLembrete(lembrete)}>
          {textoDoLembrete(lembrete)}
        </Faixa>
      ))}
      {maisAtrasos > 0 ? (
        <Faixa href={DESTINO_DO_LEMBRETE_DE_ATRASO} acao={TEXTOS_LEMBRETES.abrir_recebimentos}>
          {rotuloMaisAtrasos(maisAtrasos)}
        </Faixa>
      ) : null}
    </div>
  );
}

function Faixa({ href, acao, children }: { href: string; acao: string; children: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-toque items-center gap-3 border-b border-alert-warning-border bg-alert-warning-bg px-4 py-1.5 text-text"
    >
      <span className="min-w-0 flex-1 texto-body">{children}</span>
      <span className="shrink-0 texto-label underline">{acao}</span>
    </Link>
  );
}
