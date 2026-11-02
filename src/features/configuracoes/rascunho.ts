"use client";

import { useCallback, useEffect, useState } from "react";

// Aviso de rascunho não salvo (História 1.8, revisão 1). As seções de
// Configurações recebem `aoMudarRascunho` só no Primeiro uso, que pergunta
// antes de avançar; em Configurações a prop não vem e nada muda.

/** Prop opcional comum das seções. */
export type PropsSecao = {
  /** Chamada quando a seção passa a ter (ou deixa de ter) algo digitado e não salvo. */
  aoMudarRascunho?: (temRascunho: boolean) => void;
};

/** Avisa `aviso` sempre que `temRascunho` muda (e ao desmontar, que some o rascunho). */
export function useAvisarRascunho(temRascunho: boolean, aviso?: (temRascunho: boolean) => void) {
  useEffect(() => {
    if (!aviso) return;
    aviso(temRascunho);
    return () => aviso(false);
  }, [temRascunho, aviso]);
}

/** O mesmo, para uma linha da lista (o aviso leva o id da linha). */
export function useAvisarRascunhoDaLinha(
  id: string,
  temRascunho: boolean,
  aviso?: (id: string, temRascunho: boolean) => void,
) {
  useEffect(() => {
    if (!aviso) return;
    aviso(id, temRascunho);
    return () => aviso(id, false);
  }, [id, temRascunho, aviso]);
}

/** Junta os rascunhos de renomear das linhas de uma seção: `algum` e o aviso por linha. */
export function useRascunhosDasLinhas() {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const mudar = useCallback((id: string, tem: boolean) => {
    setIds((atuais) => {
      if (atuais.has(id) === tem) return atuais;
      const novos = new Set(atuais);
      if (tem) novos.add(id);
      else novos.delete(id);
      return novos;
    });
  }, []);
  return { algum: ids.size > 0, mudar };
}
