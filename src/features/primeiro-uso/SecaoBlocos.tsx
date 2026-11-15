"use client";

import { useEffect, useState } from "react";
import { hojeEmSaoPaulo } from "@/domain/datas";
import { mesAtual } from "@/domain/painel";
import { gerenciador, useLinhas } from "@/data/realtime";
import { BlocosDoMes } from "@/features/painel/BlocosDoMes";

// Passo "Blocos" do Primeiro uso (História 4.2, FR-19): o mesmo cartão do
// Painel (criar, editar, ver o cálculo, reordenar e excluir), com os
// Lançamentos do Mês atual se já houver (senão, os valores aparecem zerados).
// Nada fica por gravar na tela: cada Bloco grava ao salvar, então o passo não
// tem rascunho e "Continuar" e "Pular" andam sem perguntar.

export function SecaoBlocos() {
  const [mes] = useState(() => mesAtual(hojeEmSaoPaulo(new Date())));
  const lancamentos = useLinhas("lancamentos");
  // A memória de `lancamentos` guarda só um Mês (AD-4): abre o atual para os valores reais.
  useEffect(() => {
    gerenciador("lancamentos").abrirMes(mes);
  }, [mes]);
  const linhas = lancamentos.mes === mes && lancamentos.status === "pronto" ? lancamentos.linhas : [];

  return <BlocosDoMes linhas={linhas} mes={mes} />;
}
