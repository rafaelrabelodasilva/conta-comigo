"use client";

import { useEffect, useMemo, useState } from "react";
import { lerContaSalva, parcelasRecriaveis, type ContaSalva } from "@/domain/alterar-conta";
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
  mensagem,
  rotuloContaAlterada,
  rotuloContaEncerrada,
  rotuloContaExcluida,
  rotuloContaSalva,
  rotuloFiltroDeContas,
  rotuloResultadoDaLista,
} from "@/domain/mensagens";
import { mesAtual as mesDeHoje } from "@/domain/painel";
import { repoContas, type LinhaConta, type ResultadoLerConta } from "@/data/contas-repo";
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
import { FormularioConta, type ResultadoDoFormulario } from "./FormularioConta";
import { JanelaEncerrarConta } from "./JanelaEncerrarConta";
import { JanelaExcluirConta } from "./JanelaExcluirConta";
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
// - Editar, Encerrar e Excluir (História 5.4) estão no ⋯. Editar abre o
//   formulário preenchido ("Vale a partir de Mmm/AA…"), Encerrar pergunta "A
//   partir de qual mês?" e Excluir pergunta se leva os Lançamentos previstos dos
//   Meses seguintes e mostra "Conta excluída · Desfazer" (exclusão lógica, os
//   mesmos ids voltam). Ao abrir qualquer uma, a tela lê os Lançamentos da Conta
//   (uma vez) para o aviso "Ficam como estão"; quem decide o que sai, entra ou
//   fica é o núcleo (`alterar-conta.ts`) e quem grava é o repositório.
// - Sem conexão os três itens ficam desativados ("Sem conexão") e nada é
//   tentado (AD-3). "Editar" e "Encerrar" de uma Conta já Encerrada ficam
//   desativados ("Já encerrada"): não há Lançamento do Mês atual em diante a
//   mudar. "Excluir" vale sempre (limpa a lista).
// - O toque na linha continua sem fazer nada: o ⋯ é o único caminho (um toque
//   solto não abre uma edição nem uma exclusão).

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

type TipoDeAcao = "editar" | "encerrar" | "excluir";

export function ContasManuais({
  titulo,
  repo = repoContas(),
}: {
  titulo: string;
  /** O repositório (os testes passam um falso). */
  repo?: Pick<ReturnType<typeof repoContas>, "salvar" | "ler" | "alterar" | "encerrar" | "excluir" | "restaurar">;
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
  // A ação aberta (Editar, Encerrar ou Excluir) e a leitura dos Lançamentos da Conta dela.
  const [acao, setAcao] = useState<{ tipo: TipoDeAcao; conta: ContaSalva } | null>(null);
  // A leitura carrega a ação a que pertence: a de uma ação anterior nunca vale para a atual.
  const [leituraGuardada, setLeituraGuardada] = useState<{ acao: object; r: ResultadoLerConta } | null>(null);
  const leitura = leituraGuardada !== null && leituraGuardada.acao === acao ? leituraGuardada.r : null;
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

  // Ao abrir uma ação, lê os Lançamentos da Conta (uma vez): o aviso "Ficam como
  // estão" e a prévia do Encerrar e do Excluir vêm daí. Fechar a ação descarta a resposta.
  useEffect(() => {
    if (acao === null) return;
    let vale = true;
    void repo.ler(acao.conta, mesAtual).then((r) => {
      if (vale) setLeituraGuardada({ acao, r });
    });
    return () => {
      vale = false;
    };
  }, [acao, mesAtual, repo]);
  const lido = leitura !== null && leitura.ok ? leitura : null;
  const erroDaLeitura = leitura !== null && !leitura.ok ? mensagem(leitura.codigo) : null;
  const ficam = useMemo(
    () => (lido === null ? null : parcelasRecriaveis(lido.existentes, lido.statusQueContam, mesAtual, lido.comPagamento).mantidas),
    [lido, mesAtual],
  );

  async function salvar(conta: NovaConta): Promise<ResultadoDoFormulario> {
    const r = await repo.salvar(conta, mesAtual);
    if (!r.ok) return r;
    // A Conta já está na lista (o repositório a aplicou no gerenciador). Se o
    // filtro a esconderia (uma parcelada que já acabou), ele passa a mostrá-la.
    setFiltro((atual) => filtroQueMostra(situacaoDaConta(r.conta, mesAtual), atual));
    toast.mostrar({ texto: rotuloContaSalva(r.criados) });
    return r;
  }

  /** Depois de alterar ou encerrar, a Conta pode ter mudado de situação: o filtro passa a mostrá-la. */
  function mostrarConta(conta: LinhaConta) {
    setFiltro((atual) => filtroQueMostra(situacaoDaConta(conta, mesAtual), atual));
  }

  async function alterar(conta: ContaSalva, nova: NovaConta): Promise<ResultadoDoFormulario> {
    const r = await repo.alterar(conta, nova, mesAtual);
    if (!r.ok) return r;
    mostrarConta(r.conta);
    toast.mostrar({ texto: rotuloContaAlterada(r.resumo.criadas, r.resumo.mantidas.length) });
    return r;
  }

  async function encerrar(conta: ContaSalva, mes: string): Promise<ResultadoDoFormulario> {
    const r = await repo.encerrar(conta, mes, mesAtual);
    if (!r.ok) return r;
    mostrarConta(r.conta);
    toast.mostrar({ texto: rotuloContaEncerrada(r.resumo.excluidas, r.resumo.mantidas.length) });
    return r;
  }

  async function excluir(conta: ContaSalva, comLancamentos: boolean): Promise<ResultadoDoFormulario> {
    const r = await repo.excluir(conta, comLancamentos, mesAtual);
    if (!r.ok) return r;
    toast.mostrar({
      texto: rotuloContaExcluida(conta.nome, r.resumo.excluidas),
      // O "Desfazer" limpa `excluido_em` nos mesmos ids (AD-16); nunca recria com outro id.
      aoDesfazer: () => {
        void repo.restaurar(r.desfazer).then((volta) => {
          if (!volta.ok) toast.mostrar({ texto: mensagem(volta.codigo) });
        });
      },
    });
    return r;
  }

  function itensDaLinha(linha: LinhaDaLista): readonly ItemMenuAcoes[] {
    const linhaDoBanco = contasPorId.get(linha.id);
    const salva = linhaDoBanco === undefined ? null : lerContaSalva(linhaDoBanco);
    const item = (rotulo: string, tipo: TipoDeAcao, motivoFixo?: string): ItemMenuAcoes => {
      const motivo = !online ? T.sem_internet_acao : motivoFixo;
      return {
        rotulo,
        destrutivo: tipo === "excluir",
        desativado: motivo !== undefined || salva === null,
        ...(motivo === undefined ? {} : { motivo }),
        aoEscolher: () => {
          if (salva !== null) setAcao({ tipo, conta: salva });
        },
      };
    };
    // Uma Conta que já terminou não tem Lançamento do Mês atual em diante a mudar.
    const jaTerminou = linha.situacao === "encerrada" ? T.ja_encerrada : undefined;
    return [item(T.editar, "editar", jaTerminou), item(T.encerrar, "encerrar", jaTerminou), item(T.excluir, "excluir")];
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
      {acao?.tipo === "editar" ? (
        <FormularioConta
          key={acao.conta.id}
          aberta
          aoMudar={(a) => {
            if (!a) setAcao(null);
          }}
          mesAtual={mesAtual}
          responsaveis={responsaveis.linhas}
          tipos={tipos.linhas}
          online={online}
          conta={acao.conta}
          ficam={erroDaLeitura === null ? ficam : undefined}
          aoSalvar={(nova) => alterar(acao.conta, nova)}
        />
      ) : null}
      {acao?.tipo === "encerrar" ? (
        <JanelaEncerrarConta
          key={acao.conta.id}
          conta={acao.conta}
          mesAtual={mesAtual}
          leitura={lido}
          erroDaLeitura={erroDaLeitura}
          online={online}
          aoMudar={(a) => {
            if (!a) setAcao(null);
          }}
          aoEncerrar={(mes) => encerrar(acao.conta, mes)}
        />
      ) : null}
      {acao?.tipo === "excluir" ? (
        <JanelaExcluirConta
          key={acao.conta.id}
          nome={acao.conta.nome}
          mesAtual={mesAtual}
          leitura={lido}
          erroDaLeitura={erroDaLeitura}
          online={online}
          aoMudar={(a) => {
            if (!a) setAcao(null);
          }}
          aoExcluir={(comLancamentos) => excluir(acao.conta, comLancamentos)}
        />
      ) : null}
    </Tela>
  );
}
