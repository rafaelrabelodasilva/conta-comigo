"use client";

import { useEffect, useMemo } from "react";
import { lerBlocos } from "@/domain/blocos";
import type { NomesDaFormula } from "@/domain/formula";
import { TEXTOS_GERAR as T } from "@/domain/mensagens";
import { mensagemDeCobranca } from "@/domain/mensagem-janela";
import type { ModeloMensagem } from "@/domain/modelo-mensagem";
import type { OpcoesDoPendente } from "@/domain/projecoes";
import type { LancamentoDaCobranca } from "@/domain/recebimentos";
import { useLinhas } from "@/data/realtime";
import { JanelaGerarMensagem } from "@/features/painel/JanelaGerarMensagem";
import { useToast } from "@/ui/Toast";

// A janela "Gerar mensagem" de "Cobrar pendências" (História 6.7, FR-28): a forma 3, o que o Bloco de cobrança
// ainda deve, de todos os Meses. É a mesma janela da Seleção e do Bloco (`JanelaGerarMensagem`: o quadro, os
// avisos, "Copiar", "Editar modelo"); aqui só se entrega a mensagem pronta do núcleo (`mensagemDeCobranca`), que usa
// as mesmas linhas do Saldo do cartão (AD-11). Os Lançamentos de todos os Meses e as opções (Status pagos, itens
// de Pagamento, Meses com Fatura, hoje) vêm de Recebimentos, que já os lê. A janela acompanha o Realtime (o texto se
// refaz e avisa que mudou). Um Bloco excluído em outro aparelho com a janela aberta fecha a janela e avisa.
// Sem "Incluir previstos": um previsto nunca é o que se cobra (decisão 2 da 6.5).

export type PropsJanelaMensagemDeCobranca = {
  blocoId: string;
  aoMudar: (aberta: boolean) => void;
  /** Os Lançamentos de todos os Meses (o gerenciador `lancamentos:todos`). */
  lancamentos: readonly LancamentoDaCobranca[];
  /** As mesmas opções do Saldo pendente do cartão. */
  opcoes: OpcoesDoPendente;
  modelo: ModeloMensagem;
  aoEditarModelo: () => void;
};

export function JanelaMensagemDeCobranca({
  blocoId,
  aoMudar,
  lancamentos,
  opcoes,
  modelo,
  aoEditarModelo,
}: PropsJanelaMensagemDeCobranca) {
  const toast = useToast();
  const blocosLidos = useLinhas("blocos");
  const responsaveis = useLinhas("responsaveis");
  const tipos = useLinhas("tipos");
  const bloco = useMemo(() => lerBlocos(blocosLidos.linhas).find((b) => b.id === blocoId), [blocosLidos.linhas, blocoId]);
  // Os nomes com os arquivados: uma Fórmula antiga ainda os cita.
  const nomes = useMemo<NomesDaFormula>(
    () => ({
      responsaveis: new Map(responsaveis.linhas.map((r) => [r.id, r.nome])),
      tipos: new Map(tipos.linhas.map((t) => [t.id, t.nome])),
    }),
    [responsaveis.linhas, tipos.linhas],
  );

  const sumiu = bloco === undefined && blocosLidos.status === "pronto";
  useEffect(() => {
    if (!sumiu) return;
    aoMudar(false);
    toast.mostrar({ texto: T.bloco_excluido });
  }, [sumiu, aoMudar, toast]);

  if (bloco === undefined) return null;
  return (
    <JanelaGerarMensagem
      aberta
      aoMudar={aoMudar}
      temFatura
      aoEditarModelo={aoEditarModelo}
      montar={() => mensagemDeCobranca(modelo, bloco.formula, lancamentos, opcoes, nomes)}
    />
  );
}
