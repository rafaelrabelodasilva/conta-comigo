"use client";

import { useMemo, useState } from "react";
import type { NovaConta } from "@/domain/contas-manuais";
import { hojeEmSaoPaulo } from "@/domain/datas";
import {
  FILTRO_PADRAO_DE_CONTAS,
  FILTROS_DE_CONTAS,
  contagemPorFiltro,
  filtroQueMostra,
  linhasDaLista,
  situacaoDaConta,
  type FiltroDeContas,
  type LinhaDaLista,
} from "@/domain/lista-contas";
import {
  TEXTOS_CONTAS as T,
  rotuloContaSalva,
  rotuloFiltroDeContas,
  rotuloResultadoDaLista,
} from "@/domain/mensagens";
import { mesAtual as mesDeHoje } from "@/domain/painel";
import { repoContas, type LinhaConta, type ResultadoSalvarConta } from "@/data/contas-repo";
import { useConexao } from "@/data/conexao";
import { gerenciador, useLinhas } from "@/data/realtime";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { EstadoVazio } from "@/ui/EstadoVazio";
import type { ItemMenuAcoes } from "@/ui/MenuAcoes";
import { Tela } from "@/ui/Tela";
import { useToast } from "@/ui/Toast";
import { FormularioConta } from "./FormularioConta";
import { ListaContas } from "./ListaContas";

// Contas manuais (Histórias 5.1 e 5.2, FR-16, FR-17, UX-DR24). A lista lê a
// tabela `contas_manuais` pelo gerenciador de Realtime (AD-4), com os filtros
// "Ativas / Encerradas / Todas" e o ⋯ de cada linha; "＋ Nova conta" abre o
// formulário da 5.1. Toda regra (situação, filtro, ordem, etiquetas) é do
// núcleo (`lista-contas.ts`); aqui só há estado de tela e desenho.
//
// - O filtro vive só na tela (abre em "Ativas"; ao sair e voltar, volta a
//   "Ativas"). O formulário é uma janela por cima da lista, então não há
//   "voltar do formulário" que o perca.
// - Sem internet a lista continua (só consulta). "＋ Nova conta" abre e o
//   formulário desativa "Salvar" (5.1).
// - Editar, Encerrar e Excluir são da 5.4: ficam no ⋯, visíveis e
//   desativados com "Em breve". O gancho é um callback por ação (`acoes`),
//   sem lógica aqui: quem passa o callback liga o item (e ele vale só com
//   internet).

/** O que cada item do ⋯ faz; a 5.4 passa os três. Sem o callback, o item aparece desativado ("Em breve"). */
export type AcoesDaConta = {
  aoEditar?: (conta: LinhaConta) => void;
  aoEncerrar?: (conta: LinhaConta) => void;
  aoExcluir?: (conta: LinhaConta) => void;
};

const NOME_DO_FILTRO: Record<FiltroDeContas, string> = {
  ativas: T.filtro_ativas,
  encerradas: T.filtro_encerradas,
  todas: T.filtro_todas,
};

const TEXTO_SEM_RESULTADO: Record<FiltroDeContas, string> = {
  ativas: T.vazio_ativas,
  encerradas: T.vazio_encerradas,
  todas: T.vazio,
};

export function ContasManuais({
  titulo,
  repo = repoContas(),
  acoes = {},
}: {
  titulo: string;
  /** O repositório (os testes passam um falso). */
  repo?: Pick<ReturnType<typeof repoContas>, "salvar">;
  acoes?: AcoesDaConta;
}) {
  // O relógio fica fora do núcleo: "hoje" é lido aqui, uma vez.
  const [mesAtual] = useState(() => mesDeHoje(hojeEmSaoPaulo(new Date())));
  const contas = useLinhas("contas_manuais");
  const responsaveis = useLinhas("responsaveis");
  const tipos = useLinhas("tipos");
  const online = useConexao();
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState<FiltroDeContas>(FILTRO_PADRAO_DE_CONTAS);
  const cadastrosProntos = responsaveis.status === "pronto" && tipos.status === "pronto";
  const erro = [contas, responsaveis, tipos].some((r) => r.status === "erro");
  const carregando = !erro && !(cadastrosProntos && contas.status === "pronto");

  const contagem = useMemo(() => contagemPorFiltro(contas.linhas, mesAtual), [contas.linhas, mesAtual]);
  const linhas = useMemo(
    () =>
      linhasDaLista(contas.linhas, filtro, { responsaveis: responsaveis.linhas, tipos: tipos.linhas }, mesAtual),
    [contas.linhas, filtro, responsaveis.linhas, tipos.linhas, mesAtual],
  );
  const contasPorId = useMemo(() => new Map(contas.linhas.map((c) => [c.id, c])), [contas.linhas]);

  async function salvar(conta: NovaConta): Promise<ResultadoSalvarConta> {
    const r = await repo.salvar(conta, mesAtual);
    if (!r.ok) return r;
    // A Conta já está na lista (o repositório a aplicou no gerenciador). Se o
    // filtro a esconderia (uma parcelada que já acabou), ele passa a mostrá-la.
    setFiltro((atual) => filtroQueMostra(situacaoDaConta(r.conta, mesAtual), atual));
    toast.mostrar({ texto: rotuloContaSalva(r.criados) });
    return r;
  }

  function itensDaLinha(linha: LinhaDaLista): readonly ItemMenuAcoes[] {
    const conta = contasPorId.get(linha.id);
    const item = (
      rotulo: string,
      aoAcionar: ((c: LinhaConta) => void) | undefined,
      destrutivo = false,
    ): ItemMenuAcoes => {
      const motivo = aoAcionar === undefined ? T.em_breve : !online ? T.sem_internet_acao : undefined;
      return {
        rotulo,
        destrutivo,
        desativado: motivo !== undefined || conta === undefined,
        ...(motivo === undefined ? {} : { motivo }),
        aoEscolher: () => {
          if (conta !== undefined) aoAcionar?.(conta);
        },
      };
    };
    return [item(T.editar, acoes.aoEditar), item(T.encerrar, acoes.aoEncerrar), item(T.excluir, acoes.aoExcluir, true)];
  }

  const botaoNova = (comoAcaoDoVazio: boolean) => (
    <Botao
      variante="primario"
      {...(comoAcaoDoVazio ? {} : { "aria-label": T.rotulo_nova })}
      disabled={!cadastrosProntos}
      onClick={() => setAberto(true)}
    >
      <span aria-hidden>＋</span>
      {T.botao_nova}
    </Botao>
  );

  const temContas = !erro && !carregando && contas.linhas.length > 0;

  let conteudo;
  if (erro) {
    conteudo = (
      <ErroAoCarregar
        aoTentarDeNovo={() => {
          void gerenciador("contas_manuais").recarregar();
          void gerenciador("responsaveis").recarregar();
          void gerenciador("tipos").recarregar();
        }}
      />
    );
  } else if (carregando) {
    conteudo = (
      <div role="status" aria-busy="true" className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2">
        <span className="sr-only">{T.carregando}</span>
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-toque" />
        ))}
      </div>
    );
  } else if (contas.linhas.length === 0) {
    conteudo = (
      <EstadoVazio
        texto={T.vazio}
        acao={
          <>
            <p className="texto-caption text-text-muted">{T.explicacao_vazio}</p>
            {botaoNova(true)}
          </>
        }
      />
    );
  } else if (linhas.length === 0) {
    conteudo = <EstadoVazio texto={TEXTO_SEM_RESULTADO[filtro]} />;
  } else {
    conteudo = <ListaContas linhas={linhas} itensDaLinha={itensDaLinha} />;
  }

  return (
    <Tela
      titulo={titulo}
      acoes={
        <>
          {temContas ? (
            <div role="group" aria-label={T.filtrar} className="flex items-center gap-2">
              {FILTROS_DE_CONTAS.map((f) => {
                const ligado = f === filtro;
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={ligado}
                    aria-label={rotuloFiltroDeContas(NOME_DO_FILTRO[f], contagem[f])}
                    onClick={() => setFiltro(f)}
                    className={cn(
                      "inline-flex min-h-toque cursor-pointer items-center gap-1.5 rounded-full border px-3 texto-body",
                      ligado ? "border-accent-line bg-selection text-text texto-body-strong" : "border-border bg-surface text-text-muted",
                    )}
                  >
                    {NOME_DO_FILTRO[f]}
                    <span aria-hidden className="texto-caption tabular-nums text-text-muted">
                      {contagem[f]}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {botaoNova(false)}
        </>
      }
    >
      {temContas ? (
        <p role="status" className="sr-only">
          {rotuloResultadoDaLista(filtro, linhas.length)}
        </p>
      ) : null}
      {conteudo}
      {aberto ? (
        <FormularioConta
          aberta
          aoMudar={setAberto}
          mesAtual={mesAtual}
          responsaveis={responsaveis.linhas}
          tipos={tipos.linhas}
          online={online}
          aoSalvar={salvar}
        />
      ) : null}
    </Tela>
  );
}
