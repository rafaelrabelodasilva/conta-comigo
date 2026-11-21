"use client";

import { useMemo } from "react";
import { avisosDaCentral, type CentralDeAvisos, type ChaveLida, type OrigemDoAviso } from "@/domain/avisos";
import { avisosDeTrabalho, preferenciasDeAvisos } from "@/domain/avisos-preferencias";
import { lembretesDasLinhas } from "@/domain/lembretes";
import { configuracoesDoDono } from "@/data/configuracoes-repo";
import {
  gerenciador,
  gerenciadorFila,
  gerenciadorItensDoHistorico,
  gerenciadorTodosOsLancamentos,
  useFilaRevisar,
  useItensDoHistorico,
  useLinhas,
  useTodosOsLancamentos,
} from "@/data/realtime";
import { useHoje } from "@/ui/use-hoje";

// O hook da Central de Avisos (História 8.1 e 8.2, FR-55, AD-4, AD-10): o menu (o contador) e a tela `/avisos` leem o
// mesmo estado. Ele abre, na abertura do app (o menu lateral mora no layout), os MESMOS gerenciadores de Realtime
// que a faixa da 7.4 abria (decisão 8 da 7.4: o contador precisa deles), mais o de `avisos_lidos`, os cartões lidos das
// Faturas (`fatura_cartoes`, a Conferência) e a fila do Revisar (o mesmo gerenciador do contador "para revisar"), e
// nunca lê o banco por conta própria. Os lembretes são os de `lembretesDasLinhas`, a mesma função do Cron; a diferença da
// Conferência e a fila do Revisar vêm de `avisosDeConferencia` e `avisoDoRevisar` (que usam `conferir` e `contarFila`,
// as contas da faixa do Painel e do menu); quem decide ordem, contagem e "lido" é o núcleo (`avisosDaCentral`).
//
// - Carregando: qualquer das nove leituras dos avisos (ou a dos lidos) ainda sem dados. Nada de número parcial.
// - Erro: qualquer das nove leituras dos avisos falhou. Quem avisa é a tela (`ErroAoCarregar`); o menu não mostra
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
  void gerenciadorFila().recarregar();
  for (const t of ["blocos", "status", "faturas", "fatura_cartoes", "config_ciclo", "configuracoes", "avisos_lidos"] as const) {
    void gerenciador(t).recarregar();
  }
}

export function useCentralDeAvisos(): EstadoDaCentral {
  const todos = useTodosOsLancamentos();
  const itens = useItensDoHistorico();
  const blocos = useLinhas("blocos");
  const status = useLinhas("status");
  const faturas = useLinhas("faturas");
  const cartoes = useLinhas("fatura_cartoes");
  const fila = useFilaRevisar();
  const ciclo = useLinhas("config_ciclo");
  const configuracoes = useLinhas("configuracoes");
  const lidos = useLinhas("avisos_lidos");
  const hoje = useHoje();

  const dosAvisos = [todos, itens, blocos, status, faturas, cartoes, fila, ciclo, configuracoes];
  const erro = dosAvisos.some((r) => r.status === "erro");
  const pronto = !erro && dosAvisos.every((r) => r.status === "pronto") && lidos.status !== "carregando";
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
    // As mesmas contas da faixa do Painel (`conferir`) e do menu (`contarFila`): a Central nunca tem a sua. O interruptor
    // da Conferência e o do Revisar (8.3) valem aqui, antes de `avisosDaCentral`: o tipo desligado nem é calculado, não
    // conta no menu e não entra em "Marcar tudo". O Cron não lê estas preferências (não são lembretes).
    const dono = configuracoesDoDono(configuracoes.linhas);
    const origens: OrigemDoAviso[] = [
      ...lembretes,
      ...avisosDeTrabalho(faturas.linhas, cartoes.linhas, todos.linhas, fila.linhas, preferenciasDeAvisos(dono)),
    ];
    return avisosDaCentral(origens, linhasLidas);
  }, [
    pronto,
    hoje,
    ciclo.linhas,
    todos.linhas,
    blocos.linhas,
    status.linhas,
    itens.linhas,
    faturas.linhas,
    cartoes.linhas,
    fila.linhas,
    configuracoes.linhas,
    linhasLidas,
  ]);

  if (erro) return { status: "erro" };
  if (central === null) return { status: "carregando" };
  return { status: "pronto", central };
}
