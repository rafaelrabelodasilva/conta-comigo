"use client";

import { useEffect, useMemo } from "react";
import { lerBlocos } from "@/domain/blocos";
import type { NomesDaFormula } from "@/domain/formula";
import { TEXTOS_GERAR as T } from "@/domain/mensagens";
import { mensagemDoBloco } from "@/domain/mensagem-janela";
import type { ModeloMensagem } from "@/domain/modelo-mensagem";
import type { ItemLido } from "@/domain/pagamento";
import type { LancamentoParaMensagem } from "@/domain/projecoes";
import { useLinhas } from "@/data/realtime";
import { useToast } from "@/ui/Toast";
import { JanelaGerarMensagem } from "./JanelaGerarMensagem";

// A janela "Gerar mensagem" de um Bloco (História 4.7, FR-53): a forma 2. Lê o Bloco e
// os nomes dos cadastros pelo gerenciador de Realtime (`useLinhas`) e entrega à janela
// da 4.6 a mensagem pronta do núcleo (`mensagemDoBloco`); os Lançamentos, os Status
// que contam como pago e o modelo vêm do Painel, que já os lê. O Bloco que outro
// aparelho exclui com a janela aberta fecha a janela e avisa (como "Ver cálculo",
// 4.2): copiar uma conta sem dono não serve. Um Bloco que ficar sem valor continua
// aqui, e a janela diz que está sem valor.

export type PropsJanelaMensagemDoBloco = {
  blocoId: string;
  aoMudar: (aberta: boolean) => void;
  /** Os Lançamentos da memória (o núcleo separa o Mês). */
  lancamentos: readonly LancamentoParaMensagem[];
  mes: string;
  temFatura: boolean;
  /** Hoje (`AAAA-MM-DD`, America/Sao_Paulo): a Dívida programada ainda não vencida fica de fora (6.6). */
  hoje: string;
  /** Os Status que contam como pago. */
  statusPagos: ReadonlySet<string>;
  /** Os itens de Pagamento do Mês (6.2): um Pago parcialmente entra só com o que falta. */
  itens: readonly ItemLido[];
  /** Os itens já foram lidos? Antes disso a janela espera em vez de mostrar o valor cheio. */
  itensProntos: boolean;
  modelo: ModeloMensagem;
  aoEditarModelo: () => void;
};

export function JanelaMensagemDoBloco({
  blocoId,
  aoMudar,
  lancamentos,
  mes,
  temFatura,
  hoje,
  statusPagos,
  itens,
  itensProntos,
  modelo,
  aoEditarModelo,
}: PropsJanelaMensagemDoBloco) {
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
      temFatura={temFatura}
      aoEditarModelo={aoEditarModelo}
      aguardando={!itensProntos}
      montar={(incluirPrevistos) =>
        mensagemDoBloco(modelo, bloco.formula, lancamentos, { mes, statusPagos, temFatura, incluirPrevistos, itens, hoje }, nomes)
      }
    />
  );
}
