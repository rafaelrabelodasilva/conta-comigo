"use client";

import { useMemo } from "react";
import { avisosDaCentral, type CentralDeAvisos, type ChaveLida } from "@/domain/avisos";
import { lembretesDasLinhas } from "@/domain/lembretes";
import { configuracoesDoDono } from "@/data/configuracoes-repo";
import {
  gerenciador,
  gerenciadorItensDoHistorico,
  gerenciadorTodosOsLancamentos,
  useItensDoHistorico,
  useLinhas,
  useTodosOsLancamentos,
} from "@/data/realtime";
import { useHoje } from "@/ui/use-hoje";

// O hook da Central de Avisos (História 8.1, FR-55, AD-4, AD-10): o menu (o contador) e a tela `/avisos` leem o
// mesmo estado. Ele abre, na abertura do app (o menu lateral mora no layout), os MESMOS gerenciadores de Realtime
// que a faixa da 7.4 abria (decisão 8 da 7.4: o contador precisa deles), mais o de `avisos_lidos`, e nunca lê o banco
// por conta própria. Os lembretes são os de `lembretesDasLinhas`, a mesma função do Cron, e quem decide ordem,
// contagem e "lido" é o núcleo (`avisosDaCentral`).
//
// - Carregando: qualquer das sete leituras dos lembretes (ou a dos lidos) ainda sem dados. Nada de número parcial.
// - Erro: qualquer das sete leituras dos lembretes falhou. Quem avisa é a tela (`ErroAoCarregar`); o menu não mostra
//   contador.
// - A leitura dos lidos que falha (a tabela ainda não existe entre o merge e o `db push`, ou a rede) NÃO é erro da
//   Central: vale como "nada lido". Tudo aparece como Novo, o contador conta, e só marcar como lido responde "Não
//   foi possível salvar". Sem conexão depois de carregar, o gerenciador mantém o que sabe.
// - O dia vem de `useHoje`: com o app aberto na virada da meia-noite, os avisos e o contador recalculam sozinhos.

/** Sem lidos (a leitura deles falhou): a mesma lista a cada desenho, para o `useMemo` não refazer a conta à toa. */
const SEM_LIDOS: readonly ChaveLida[] = [];

export type EstadoDaCentral =
  | { status: "carregando" }
  | { status: "erro" }
  | { status: "pronto"; central: CentralDeAvisos };

/** Relê tudo o que a Central lê (o "Tentar de novo" da tela). */
export function recarregarCentralDeAvisos(): void {
  void gerenciadorTodosOsLancamentos().recarregar();
  void gerenciadorItensDoHistorico().recarregar();
  for (const t of ["blocos", "status", "faturas", "config_ciclo", "configuracoes", "avisos_lidos"] as const) {
    void gerenciador(t).recarregar();
  }
}

export function useCentralDeAvisos(): EstadoDaCentral {
  const todos = useTodosOsLancamentos();
  const itens = useItensDoHistorico();
  const blocos = useLinhas("blocos");
  const status = useLinhas("status");
  const faturas = useLinhas("faturas");
  const ciclo = useLinhas("config_ciclo");
  const configuracoes = useLinhas("configuracoes");
  const lidos = useLinhas("avisos_lidos");
  const hoje = useHoje();

  const dosLembretes = [todos, itens, blocos, status, faturas, ciclo, configuracoes];
  const erro = dosLembretes.some((r) => r.status === "erro");
  const pronto = !erro && dosLembretes.every((r) => r.status === "pronto") && lidos.status !== "carregando";
  const linhasLidas = lidos.status === "pronto" ? lidos.linhas : SEM_LIDOS;

  const central = useMemo<CentralDeAvisos | null>(() => {
    if (!pronto) return null;
    // A mesma função que o Cron usa (`lembretesDasLinhas`): o aviso do sistema nunca diverge da Central (AD-10).
    const lembretes = lembretesDasLinhas(hoje, {
      ciclo: ciclo.linhas,
      lancamentos: todos.linhas,
      blocos: blocos.linhas,
      status: status.linhas,
      itens: itens.linhas,
      faturas: faturas.linhas,
      configuracao: configuracoesDoDono(configuracoes.linhas),
    });
    return avisosDaCentral(lembretes, linhasLidas);
  }, [pronto, hoje, ciclo.linhas, todos.linhas, blocos.linhas, status.linhas, itens.linhas, faturas.linhas, configuracoes.linhas, linhasLidas]);

  if (erro) return { status: "erro" };
  if (central === null) return { status: "carregando" };
  return { status: "pronto", central };
}
