"use client";

import type { ReactNode } from "react";
import { APARENCIAS, APARENCIA_PADRAO, aparenciaDe, type Aparencia } from "@/domain/configuracoes";
import { TIPOS_DE_LEMBRETE, preferenciasDeLembretes, type TipoDeLembrete } from "@/domain/lembretes";
import { ROTULOS, TEXTOS_LEMBRETES, mensagem } from "@/domain/mensagens";
import { configuracoesDoDono, repoConfiguracoes } from "@/data/configuracoes-repo";
import { gerenciador, useLinhas } from "@/data/realtime";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { Interruptor } from "@/ui/Interruptor";
import { Seletor } from "@/ui/Seletor";
import { useToast } from "@/ui/Toast";
import { AtivarNotificacoes } from "./AtivarNotificacoes";

// Configurações → Aparência: Sistema (padrão), Claro ou Escuro, guardada em
// `configuracoes.aparencia` (vale em todos os aparelhos). A gravação é
// otimista; `AplicarTema` troca o tema assim que a memória muda e desfaz se
// o banco recusar.
//
// Lembretes (História 7.4, FR-55): um interruptor por tipo (o do dia do fechamento e o do Bloco com itens
// atrasados), guardados em `configuracoes.lembrete_fechamento` e `lembrete_atraso` (padrão ligado). A
// gravação é otimista como a da Aparência: a faixa do app (`FaixaDeLembretes`) lê a mesma linha em memória
// e some na hora. Logo abaixo, "Ativar notificações" (História 7.5): o aviso do sistema deste aparelho.

const ROTULO_APARENCIA: Record<Aparencia, string> = {
  sistema: ROTULOS.aparencia_sistema,
  claro: ROTULOS.aparencia_claro,
  escuro: ROTULOS.aparencia_escuro,
};

const ROTULO_LEMBRETE: Record<TipoDeLembrete, string> = {
  fechamento: TEXTOS_LEMBRETES.fechamento,
  atraso: TEXTOS_LEMBRETES.atraso,
};

export function SecaoAparencia() {
  const { status, linhas } = useLinhas("configuracoes");
  const toast = useToast();
  const aparencia = aparenciaDe(configuracoesDoDono(linhas)?.aparencia ?? APARENCIA_PADRAO);
  const lembretes = preferenciasDeLembretes(configuracoesDoDono(linhas));

  let conteudo: ReactNode;
  if (status === "erro") {
    conteudo = <ErroAoCarregar aoTentarDeNovo={() => void gerenciador("configuracoes").recarregar()} />;
  } else if (status !== "pronto") {
    conteudo = (
      <div className="p-2" aria-busy>
        <Esqueleto className="h-toque w-72" />
      </div>
    );
  } else {
    conteudo = (
      <div className="flex flex-col gap-3 px-2 pb-2">
        <div className="w-72">
          <Seletor
            rotulo={ROTULOS.aparencia}
            value={aparencia}
            onChange={async (e) => {
              const r = await repoConfiguracoes().definirAparencia(aparenciaDe(e.target.value));
              if (!r.ok) toast.mostrar({ texto: mensagem(r.codigo) });
            }}
            opcoes={APARENCIAS.map((a) => ({ valor: a, rotulo: ROTULO_APARENCIA[a] }))}
          />
        </div>
        <div role="group" aria-labelledby="titulo-lembretes" className="flex flex-col">
          <h3 id="titulo-lembretes" className="texto-body-strong">
            {TEXTOS_LEMBRETES.titulo_preferencias}
          </h3>
          <p className="texto-caption text-text-muted">{TEXTOS_LEMBRETES.ajuda_preferencias}</p>
          {TIPOS_DE_LEMBRETE.map((tipo) => (
            <Interruptor
              key={tipo}
              rotulo={ROTULO_LEMBRETE[tipo]}
              ligado={lembretes[tipo]}
              aoMudar={async (ligado) => {
                const r = await repoConfiguracoes().definirLembrete(tipo, ligado);
                if (!r.ok) toast.mostrar({ texto: mensagem(r.codigo) });
              }}
            />
          ))}
        </div>
        <AtivarNotificacoes />
      </div>
    );
  }

  return (
    <section
      aria-labelledby="titulo-aparencia"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
    >
      <header className="flex items-center">
        <h2 id="titulo-aparencia" className="flex-1 texto-body-strong">
          {ROTULOS.aparencia}
        </h2>
      </header>
      {conteudo}
    </section>
  );
}
