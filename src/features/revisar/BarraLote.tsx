"use client";

import { textosDaBarra } from "@/domain/selecao";
import { TEXTOS_REVISAR as T } from "@/domain/mensagens";
import { Botao } from "@/ui/Botao";
import { BOTAO_NA_BARRA, BarraSelecao, VARIAVEL_ALTURA_BARRA } from "@/ui/BarraSelecao";

// Barra de lote (`selection-bar`, História 3.3): a base `BarraSelecao` com
// "Limpar", "Responsável…", "Tipo…" e "Aplicar sugestões" (principal). O total
// é a soma líquida (mãe mais Ajustes). A contagem é `role="status"`.

export { VARIAVEL_ALTURA_BARRA };

export type PropsBarraLote = {
  quantidade: number;
  /** A soma líquida dos selecionados. */
  totalCentavos: number;
  /** Um lote está sendo gravado: as ações ficam desligadas. */
  ocupado?: boolean;
  aoLimpar: () => void;
  aoEscolherResponsavel: () => void;
  aoEscolherTipo: () => void;
  aoAplicarSugestoes: () => void;
};

export function BarraLote({
  quantidade,
  totalCentavos,
  ocupado = false,
  aoLimpar,
  aoEscolherResponsavel,
  aoEscolherTipo,
  aoAplicarSugestoes,
}: PropsBarraLote) {
  const { contagem, total } = textosDaBarra(quantidade, totalCentavos);
  return (
    <BarraSelecao rotulo={T.barra_lote} contagem={contagem} total={total}>
      <Botao className={BOTAO_NA_BARRA} disabled={ocupado} onClick={aoLimpar}>
        {T.limpar}
      </Botao>
      <Botao className={BOTAO_NA_BARRA} disabled={ocupado} onClick={aoEscolherResponsavel}>
        {T.responsavel_lote}
      </Botao>
      <Botao className={BOTAO_NA_BARRA} disabled={ocupado} onClick={aoEscolherTipo}>
        {T.tipo_lote}
      </Botao>
      <Botao variante="primario" disabled={ocupado} onClick={aoAplicarSugestoes}>
        {T.aplicar_sugestoes}
      </Botao>
    </BarraSelecao>
  );
}
