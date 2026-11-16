"use client";

import type { ResumoDaSelecao } from "@/domain/selecao";
import { TEXTOS_PAGAMENTO, TEXTOS_SELECAO as T, mensagem } from "@/domain/mensagens";
import { BOTAO_NA_BARRA, BarraSelecao } from "@/ui/BarraSelecao";
import { Botao } from "@/ui/Botao";
import { MenuAcoes } from "@/ui/MenuAcoes";

// Barra de Seleção do Painel (História 4.4, FR-48, UX-DR12): a `selection-bar`
// presa embaixo, só com 1+ itens, com "N selecionados · R$ total" (o texto vem do
// núcleo), "Limpar", "Aplicar status" (FR-25, História 6.1: abre a janela com a lista de
// Status; desativado sem conexão, AD-3), "⋯ Mais" (Classificar em lote, Excluir) e "Gerar
// mensagem" (FR-24, História 4.6), que abre a janela com a mensagem da Seleção. "Programar
// dívida" é da História 6.6. O anúncio ao leitor de tela é de uma região que o Painel
// mantém no DOM, vazia, antes da primeira marcação.

export type PropsBarraSelecaoPainel = {
  resumo: Pick<ResumoDaSelecao, "contagem" | "total">;
  /** Uma gravação em lote está em curso: as ações ficam desligadas. */
  ocupado?: boolean;
  /** O painel lateral do Lançamento está aberto. */
  comPainelLateral?: boolean;
  /** "Excluir" só aparece se alguma marcada pode ser excluída (a parte de uma Divisão não pode). */
  podeExcluir: boolean;
  /** Sem conexão "Aplicar status" fica desativado (AD-3). */
  online?: boolean;
  aoLimpar: () => void;
  aoAplicarStatus: () => void;
  aoClassificar: () => void;
  aoExcluir: () => void;
  aoGerarMensagem: () => void;
};

export function BarraSelecaoPainel({
  resumo,
  ocupado = false,
  comPainelLateral = false,
  podeExcluir,
  online = true,
  aoLimpar,
  aoAplicarStatus,
  aoClassificar,
  aoExcluir,
  aoGerarMensagem,
}: PropsBarraSelecaoPainel) {
  return (
    <BarraSelecao
      rotulo={T.barra}
      contagem={resumo.contagem}
      total={resumo.total}
      regiaoPropria={false}
      comPainelLateral={comPainelLateral}
    >
      <Botao className={BOTAO_NA_BARRA} disabled={ocupado} onClick={aoLimpar}>
        {T.limpar}
      </Botao>
      <Botao
        className={BOTAO_NA_BARRA}
        disabled={ocupado || !online}
        title={online ? undefined : mensagem("conexao.sem_conexao")}
        onClick={aoAplicarStatus}
      >
        {TEXTOS_PAGAMENTO.aplicar_status}
      </Botao>
      <MenuAcoes
        rotulo={T.mais}
        gatilhoComTexto={{ texto: T.mais, className: BOTAO_NA_BARRA, desativado: ocupado }}
        itens={[
          { rotulo: T.classificar_em_lote, aoEscolher: aoClassificar },
          ...(podeExcluir ? [{ rotulo: T.excluir, aoEscolher: aoExcluir, destrutivo: true as const }] : []),
        ]}
      />
      <Botao variante="primario" disabled={ocupado} onClick={aoGerarMensagem}>
        {T.gerar_mensagem}
      </Botao>
    </BarraSelecao>
  );
}
