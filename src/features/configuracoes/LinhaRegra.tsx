"use client";

import { formatarData, hojeEmSaoPaulo } from "@/domain/datas";
import {
  TEXTOS_REGRAS as T,
  rotuloAsVezes,
  rotuloEditarRegra,
  rotuloExcluirRegra,
} from "@/domain/mensagens";
import { Botao } from "@/ui/Botao";

// Uma linha da lista de Regras aprendidas (História 3.4): chave, Responsável
// (e "às vezes X" quando a contagem tem outros), Tipo, Divisão (sempre "—"
// até a 3.8), última vez usada e os botões Editar e Excluir (44 pt).

export const COLUNAS_REGRA = "grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_56px_88px_184px]";

export type PropsLinhaRegra = {
  chave: string;
  responsavel: string | null;
  /** Nomes dos outros Responsáveis da contagem. */
  outrosResponsaveis: readonly string[];
  tipo: string | null;
  /** O instante do último uso (ISO). */
  ultimoUso: string;
  aoEditar: () => void;
  aoExcluir: () => void;
};

/** "06/11/26" a partir do instante, no fuso de São Paulo. */
function dataDoUso(instante: string): string {
  const d = new Date(instante);
  return Number.isNaN(d.getTime()) ? T.sem_valor : formatarData(hojeEmSaoPaulo(d));
}

export function LinhaRegra({ chave, responsavel, outrosResponsaveis, tipo, ultimoUso, aoEditar, aoExcluir }: PropsLinhaRegra) {
  return (
    <li className={`grid min-h-16 items-center gap-3 border-b border-border-subtle px-3.5 py-2 last:border-b-0 ${COLUNAS_REGRA}`}>
      <p className="min-w-0 truncate texto-body-strong">{chave}</p>
      <div className="min-w-0">
        <p className="truncate texto-body">{responsavel ?? T.sem_valor}</p>
        {outrosResponsaveis.length > 0 ? (
          <p className="truncate texto-caption text-text-muted">{rotuloAsVezes(outrosResponsaveis)}</p>
        ) : null}
      </div>
      <p className="min-w-0 truncate texto-body">{tipo ?? T.sem_valor}</p>
      <p className="texto-body text-text-muted">{T.sem_divisao}</p>
      <p className="texto-number text-text-muted">{dataDoUso(ultimoUso)}</p>
      <div className="flex justify-end gap-2">
        <Botao aria-label={rotuloEditarRegra(chave)} onClick={aoEditar}>
          {T.editar}
        </Botao>
        <Botao variante="destrutivo" aria-label={rotuloExcluirRegra(chave)} onClick={aoExcluir}>
          {T.excluir}
        </Botao>
      </div>
    </li>
  );
}
