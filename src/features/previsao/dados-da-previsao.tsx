"use client";

import { TEXTOS_PREVISAO as T } from "@/domain/mensagens";
import { mesAtual } from "@/domain/painel";
import { gerenciador, gerenciadorTodosOsLancamentos, useLinhas, useTodosOsLancamentos } from "@/data/realtime";
import { Esqueleto } from "@/ui/Esqueleto";
import { useHoje } from "@/ui/use-hoje";

// As quatro leituras que "Próximos meses" (7.1) e "Evolução" (7.2) usam, e o esqueleto de espera (AD-4: só pelo
// gerenciador de Realtime, nenhuma leitura avulsa). Os Lançamentos de TODOS os Meses vêm do gerenciador da 6.5, o mesmo
// canal que Recebimentos usa; `faturas` diz quais Meses têm Fatura importada; `responsaveis` e `tipos` dão nome, ordem e
// cor. As duas abas montam a mesma tela dos mesmos dados, então nenhuma delas abre assinatura nova.

export function useDadosDaPrevisao() {
  const lancamentos = useTodosOsLancamentos();
  const faturas = useLinhas("faturas");
  const responsaveis = useLinhas("responsaveis");
  const tipos = useLinhas("tipos");
  const hoje = useHoje();

  const retratos = [lancamentos, faturas, responsaveis, tipos];
  const erro = retratos.some((r) => r.status === "erro");
  const pronto = !erro && retratos.every((r) => r.status === "pronto");

  function tentarDeNovo() {
    void gerenciadorTodosOsLancamentos().recarregar();
    for (const t of ["faturas", "responsaveis", "tipos"] as const) void gerenciador(t).recarregar();
  }

  return { lancamentos, faturas, responsaveis, tipos, erro, pronto, atual: mesAtual(hoje), tentarDeNovo };
}

/** Esperando alguma das quatro leituras: nunca o estado vazio. */
export function EsqueletoDaPrevisao({ texto = T.carregando }: { texto?: string }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{texto}</span>
      <Esqueleto className="h-64" />
      <Esqueleto className="h-32" />
    </div>
  );
}
