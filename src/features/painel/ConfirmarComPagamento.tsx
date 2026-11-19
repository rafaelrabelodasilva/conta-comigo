"use client";

import { useEffect, useMemo, useRef } from "react";
import { avisarMudancaComPagamento, type MudancaDeLinha } from "@/domain/aviso-pagamento";
import type { Bloco } from "@/domain/blocos";
import { TEXTOS_AVISO_PAGAMENTO, textoDoAvisoDePagamento } from "@/domain/mensagens";
import type { LancamentoParaPendente } from "@/domain/projecoes";
import { useItensDoHistorico, useLinhas, useTodosOsLancamentos } from "@/data/realtime";
import { ConfirmarAcao } from "@/ui/ConfirmarAcao";

// Confirmação ao mexer num Lançamento que já tem Pagamento (História 6.9, FR-46, AD-11): "Este lançamento tem
// pagamento registrado em 08/10/26. O Saldo pendente do Bloco Mãe muda de R$ 0,00 para - R$ 310,67." É uma
// confirmação antes de gravar, não um bloqueio. O "de R$ X para R$ Y" é `avisarMudancaComPagamento` (o núcleo:
// `projetarPendente` antes e depois e a Fórmula de cada Bloco de cobrança); nada aqui faz conta.
//
// Este componente só é montado quando a linha mexida tem item de Pagamento vivo (o chamador sabe pelos itens do Mês
// aberto). É ele quem abre os gerenciadores de TODOS os Meses (Lançamentos, itens, Pagamentos e Faturas), a mesma
// memória de Recebimentos: o Painel comum não os paga (AD-4, 6.5). Enquanto leem, a janela diz "Conferindo…" e o
// botão fica desativado. Se a leitura falhar, a janela avisa que não conferiu e deixa confirmar.
//
// Dois jeitos de usar: sem `aoSemAviso` (a exclusão, que sempre pede confirmação) a janela abre sempre, com o aviso
// antes da descrição de sempre; com `aoSemAviso` (editar um campo) ela só aparece se houver o que avisar, e quando
// não há (a mudança não mexe no Valor, não exclui e não move Saldo) segue direto.

export type ContextoDoAviso = {
  blocos: readonly Bloco[];
  statusPagos: ReadonlySet<string>;
  /** Hoje (`AAAA-MM-DD`, America/Sao_Paulo). */
  hoje: string;
};

type Props = {
  mudancas: readonly MudancaDeLinha[];
  contexto: ContextoDoAviso;
  titulo: string;
  /** A descrição de sempre da ação (vem depois do aviso); vazia na edição de um campo. */
  descricao: string;
  rotuloConfirmar: string;
  aoConfirmar: () => void;
  /** Fechou sem confirmar (Esc, fora, "Cancelar"). Não é chamado depois de "confirmar". */
  aoCancelar: () => void;
  /** Sem o que avisar: segue direto, sem janela (só na edição de um campo). */
  aoSemAviso?: () => void;
};

export function ConfirmarComPagamento({
  mudancas,
  contexto,
  titulo,
  descricao,
  rotuloConfirmar,
  aoConfirmar,
  aoCancelar,
  aoSemAviso,
}: Props) {
  const todos = useTodosOsLancamentos();
  const itens = useItensDoHistorico();
  const pagamentos = useLinhas("pagamentos");
  const faturas = useLinhas("faturas");
  const leituras = [todos, itens, pagamentos, faturas];
  const falhou = leituras.some((r) => r.status === "erro");
  const pronto = !falhou && leituras.every((r) => r.status === "pronto");

  const aviso = useMemo(
    () =>
      pronto
        ? avisarMudancaComPagamento({
            lancamentos: todos.linhas as unknown as readonly LancamentoParaPendente[],
            mudancas,
            itens: itens.linhas,
            pagamentos: pagamentos.linhas,
            blocos: contexto.blocos,
            statusPagos: contexto.statusPagos,
            mesesComFatura: new Set(faturas.linhas.map((f) => f.mes)),
            hoje: contexto.hoje,
          })
        : null,
    [pronto, todos.linhas, mudancas, itens.linhas, pagamentos.linhas, faturas.linhas, contexto],
  );

  // Já decidiu (confirmou ou seguiu sem aviso): o fechamento da janela que vem depois não é "cancelar".
  const decidido = useRef(false);
  const semAviso = pronto && aviso === null && aoSemAviso !== undefined;
  useEffect(() => {
    if (!semAviso || decidido.current) return;
    decidido.current = true;
    aoSemAviso?.();
  }, [semAviso, aoSemAviso]);

  if (semAviso) return null;

  const texto = falhou
    ? TEXTOS_AVISO_PAGAMENTO.nao_conferiu
    : !pronto
      ? TEXTOS_AVISO_PAGAMENTO.conferindo
      : aviso !== null
        ? textoDoAvisoDePagamento(aviso)
        : "";
  return (
    <ConfirmarAcao
      aberta
      aoMudar={(abrir) => {
        if (!abrir && !decidido.current) {
          decidido.current = true;
          aoCancelar();
        }
      }}
      titulo={titulo}
      descricao={[texto, descricao].filter((t) => t !== "").join(" ")}
      rotuloConfirmar={rotuloConfirmar}
      desativarConfirmar={!pronto && !falhou}
      aoConfirmar={() => {
        decidido.current = true;
        aoConfirmar();
      }}
    />
  );
}
