"use client";

import type { ResumoDaSelecao } from "@/domain/selecao";
import { TEXTOS_SELECAO as T } from "@/domain/mensagens";
import { BOTAO_NA_BARRA, BarraSelecao } from "@/ui/BarraSelecao";
import { Botao } from "@/ui/Botao";
import { MenuAcoes } from "@/ui/MenuAcoes";

// Barra de Seleção do Painel (História 4.4, FR-48, UX-DR12): a `selection-bar`
// presa embaixo, só com 1+ itens, com "N selecionados · R$ total" (o texto vem do
// núcleo), "Limpar", "⋯ Mais" (Classificar em lote, Excluir) e "Gerar mensagem"
// (FR-14), que só existe e fica desativado até a História 4.6. "Aplicar status" e
// "Programar dívida" são dos Épicos 6 e 7. O anúncio ao leitor de tela é de uma
// região que o Painel mantém no DOM, vazia, antes da primeira marcação.

export type PropsBarraSelecaoPainel = {
  resumo: Pick<ResumoDaSelecao, "contagem" | "total">;
  /** Uma gravação em lote está em curso: as ações ficam desligadas. */
  ocupado?: boolean;
  /** O painel lateral do Lançamento está aberto. */
  comPainelLateral?: boolean;
  /** "Excluir" só aparece se alguma marcada pode ser excluída (a parte de uma Divisão não pode). */
  podeExcluir: boolean;
  aoLimpar: () => void;
  aoClassificar: () => void;
  aoExcluir: () => void;
};

export function BarraSelecaoPainel({
  resumo,
  ocupado = false,
  comPainelLateral = false,
  podeExcluir,
  aoLimpar,
  aoClassificar,
  aoExcluir,
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
      <MenuAcoes
        rotulo={T.mais}
        gatilhoComTexto={{ texto: T.mais, className: BOTAO_NA_BARRA, desativado: ocupado }}
        itens={[
          { rotulo: T.classificar_em_lote, aoEscolher: aoClassificar },
          ...(podeExcluir ? [{ rotulo: T.excluir, aoEscolher: aoExcluir, destrutivo: true as const }] : []),
        ]}
      />
      {/* FR-14: a mensagem chega na História 4.6; até lá o botão só existe. */}
      <Botao variante="primario" disabled>
        {T.gerar_mensagem}
      </Botao>
    </BarraSelecao>
  );
}
