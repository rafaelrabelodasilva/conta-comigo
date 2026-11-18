"use client";

import type { ResumoDaSelecao } from "@/domain/selecao";
import { TEXTOS_DIVIDA, TEXTOS_PAGAMENTO, TEXTOS_SELECAO as T, mensagem } from "@/domain/mensagens";
import { BOTAO_NA_BARRA, BarraSelecao } from "@/ui/BarraSelecao";
import { Botao } from "@/ui/Botao";
import { MenuAcoes } from "@/ui/MenuAcoes";

// Barra de Seleção do Painel (História 4.4, FR-48, UX-DR12): a `selection-bar`
// presa embaixo, só com 1+ itens, com "N selecionados · R$ total" (o texto vem do
// núcleo), "Limpar", "Aplicar status" (FR-25, História 6.1: abre a janela com a lista de
// Status; desativado sem conexão, AD-3), "⋯ Mais" (Classificar em lote, Excluir) e "Gerar
// mensagem" (FR-24, História 4.6), que abre a janela com a mensagem da Seleção. "Programar
// dívida" (História 6.6) abre a janela da data combinada. Em Recebimentos (História 6.5) a mesma barra serve à lista "Ver", que junta
// Meses: ali só existem "Limpar" e "Aplicar status" (as outras três ações são do Painel e ficam de fora
// quando a tela não passa o `ao…` delas). O anúncio ao leitor de tela é de uma região que o Painel
// mantém no DOM, vazia, antes da primeira marcação.

export type PropsBarraSelecaoPainel = {
  resumo: Pick<ResumoDaSelecao, "contagem" | "total">;
  /** Uma gravação em lote está em curso: as ações ficam desligadas. */
  ocupado?: boolean;
  /** O painel lateral do Lançamento está aberto. */
  comPainelLateral?: boolean;
  /** "Excluir" só aparece se alguma marcada pode ser excluída (a parte de uma Divisão não pode). */
  podeExcluir?: boolean;
  /** Sem conexão "Aplicar status" fica desativado (AD-3). */
  online?: boolean;
  aoLimpar: () => void;
  aoAplicarStatus: () => void;
  /** Sem ele, "Programar dívida" não aparece (Recebimentos). */
  aoProgramar?: () => void;
  /** Sem ele, "Classificar em lote" não aparece (Recebimentos). */
  aoClassificar?: () => void;
  /** Sem ele, "Excluir" não aparece (Recebimentos). */
  aoExcluir?: () => void;
  /** Sem ele, "Gerar mensagem" não aparece (a mensagem de Recebimentos é a História 6.7). */
  aoGerarMensagem?: () => void;
};

export function BarraSelecaoPainel({
  resumo,
  ocupado = false,
  comPainelLateral = false,
  podeExcluir = false,
  online = true,
  aoLimpar,
  aoAplicarStatus,
  aoProgramar,
  aoClassificar,
  aoExcluir,
  aoGerarMensagem,
}: PropsBarraSelecaoPainel) {
  const itensDoMais = [
    ...(aoProgramar ? [{ rotulo: TEXTOS_DIVIDA.programar, aoEscolher: aoProgramar }] : []),
    ...(aoClassificar ? [{ rotulo: T.classificar_em_lote, aoEscolher: aoClassificar }] : []),
    ...(podeExcluir && aoExcluir ? [{ rotulo: T.excluir, aoEscolher: aoExcluir, destrutivo: true as const }] : []),
  ];
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
      {itensDoMais.length > 0 ? (
        <MenuAcoes
          rotulo={T.mais}
          gatilhoComTexto={{ texto: T.mais, className: BOTAO_NA_BARRA, desativado: ocupado }}
          itens={itensDoMais}
        />
      ) : null}
      {aoGerarMensagem ? (
        <Botao variante="primario" disabled={ocupado} onClick={aoGerarMensagem}>
          {T.gerar_mensagem}
        </Botao>
      ) : null}
    </BarraSelecao>
  );
}
