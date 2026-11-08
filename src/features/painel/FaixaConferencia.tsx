"use client";

import type { Conferencia } from "@/domain/conferencia";
import { TEXTOS_CONFERENCIA as T, frasesFaixaConferencia } from "@/domain/mensagens";
import { Botao } from "@/ui/Botao";

// Faixa âmbar da Conferência (História 2.5, FR-6), acima da grade: diz
// quanto a soma dos Lançamentos ficou abaixo ou acima dos totais da Fatura
// e em qual cartão está a diferença. Não bloqueia nada. "Ver lançamentos"
// liga o filtro "Verificar"; "Dispensar" esconde a faixa daquela Fatura
// (o selo e as bolinhas continuam). Quem decide se ela aparece é o Painel.

export type PropsFaixaConferencia = {
  conferencia: Conferencia;
  aoVerLancamentos: () => void;
  aoDispensar: () => void;
};

export function FaixaConferencia({ conferencia, aoVerLancamentos, aoDispensar }: PropsFaixaConferencia) {
  const [primeira, ...outras] = frasesFaixaConferencia(conferencia);
  if (!primeira) return null;
  return (
    <section
      aria-label={T.faixa}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-alert-warning-border bg-alert-warning-bg px-3 py-2 text-text"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        <p className="texto-body-strong">
          <span aria-hidden>⚠ </span>
          {primeira}
        </p>
        {outras.map((frase) => (
          <p key={frase} className="texto-body">
            {frase}
          </p>
        ))}
      </div>
      <div className="flex gap-2">
        <Botao tamanho="compacto" variante="primario" onClick={aoVerLancamentos}>
          {T.ver_lancamentos}
        </Botao>
        <Botao tamanho="compacto" variante="secundario" onClick={aoDispensar}>
          {T.dispensar}
        </Botao>
      </div>
    </section>
  );
}
