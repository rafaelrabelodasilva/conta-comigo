"use client";

import { agruparComAjustes, liquidoCentavos, textoLiquido } from "@/domain/ajustes";
import { precisaVerificar, type Conferencia } from "@/domain/conferencia";
import { agruparPartes, type PapelNaGrade } from "@/domain/divisao";
import type { ValorFiltro } from "@/domain/filtros-grade";
import { formatarDinheiro } from "@/domain/dinheiro";
import { formatarParcela } from "@/domain/importacao-fatura";
import { estadoCaixaCabecalho, type EstadoCaixa } from "@/domain/lancamento";
import { ehPrevisto } from "@/domain/previstos";
import {
  COLUNAS_GRADE as C,
  ROTULOS_LANCADO_POR,
  TEXTOS_AJUSTE,
  TEXTOS_DIVISAO,
  TEXTOS_FILTROS,
  TEXTOS_LANCAMENTO,
  TEXTOS_PAINEL as T,
  rotuloAcoesDe,
  rotuloAjusteDe,
  rotuloFiltrarPor,
  rotuloSelecionar,
  ROTULO_PREVISTO,
} from "@/domain/mensagens";
import {
  nomeExibido,
  ordenarGrade,
  rotuloLinhaAcessivel,
  somarValores,
  type ColunaOrdem,
  type LancamentoGrade,
  type NomesCadastros,
  type Ordem,
} from "@/domain/painel";
import { useCallback, useState, type MouseEvent } from "react";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { classesPessoa } from "@/ui/cores-pessoa";
import { MenuAcoes, useToqueLongo } from "@/ui/MenuAcoes";

// Grade de Lançamentos do Mês (UX-DR10). Colunas: caixa, Nome (Apelido em
// negrito + Nome em cinza), Parcela, Valor, Tipo, Responsável
// (`person-tag`), Lançado por, Status (`status-pill`) e o ⋯.
// Tocar num cabeçalho ordena (o núcleo decide a ordem); de novo, inverte.
// O cabeçalho fica fixo e, sem largura, a grade rola para os lados com a
// caixa e o Nome fixos. A linha nunca leva cor de pessoa nem de Status.
//
// "Verificar" (História 2.5): bolinha de 8 px em `verify` antes do Nome nas
// linhas que o núcleo marca (`precisaVerificar`). Para o VoiceOver, o
// `aria-label` do `<tr>` termina com "verificar este lançamento" e a célula
// do Nome leva a mesma frase num resumo oculto (`sr-only`), caso ele leia
// célula a célula; o Nome visível (com a bolinha) fica `aria-hidden` para
// não ser lido duas vezes.
//
// Painel do Lançamento (História 2.7): tocar no corpo da linha abre o painel
// (a célula do Nome é um botão cujo nome é o rótulo da linha). A caixa só
// seleciona (fundo `selection`), a `person-tag` só filtra, e o ⋯ ou o toque
// longo abrem o menu "Abrir" / "Excluir". A linha aberta no painel leva uma
// borda à esquerda em `accent-line`. A caixa do cabeçalho marca ou desmarca
// as linhas da grade (fica parcial com parte marcada).
//
// Ajustes de centavos (História 2.8): cada Ajuste vem logo abaixo da mãe, em
// qualquer ordenação, recuado 16 px, com "↳" antes do Nome e, embaixo, o
// líquido em `text-muted` ("R$ 1.140,74 - R$ 0,08 = R$ 1.140,66", com todos
// os Ajustes da mãe). Não tem caixa: fica com o fundo `selection` quando a
// mãe está selecionada. O rodapé soma as linhas visíveis, Ajustes incluídos
// (fecha no líquido).
//
// Divisão (História 3.8): as filhas de uma mãe dividida são as linhas que
// contam (caixa, filtro, rodapé); a mãe aparece só como cabeçalho antes da
// primeira filha visível, sem caixa, com o Valor apagado e "Dividido" no
// lugar do Responsável. As filhas vêm logo abaixo, recuadas 16 px, com "↳".

export type CadastroResponsavel = { nome: string; cor: number };
export type CadastroStatus = { nome: string; conta_como_pago: boolean };

export type CadastrosGrade = {
  tipos: ReadonlyMap<string, string>;
  responsaveis: ReadonlyMap<string, CadastroResponsavel>;
  status: ReadonlyMap<string, CadastroStatus>;
};

export type PropsGradeLancamentos = {
  /** Lançamentos do Mês aberto, já filtrados (sem excluídos): só as mães, sem os Ajustes. */
  linhas: readonly LancamentoGrade[];
  /** Os Ajustes de cada mãe (pelo id dela): vão logo abaixo dela. */
  ajustesPorMae?: ReadonlyMap<string, readonly LancamentoGrade[]>;
  /** As mães divididas do Mês (pelo id): viram o cabeçalho das filhas que passaram pelos filtros. */
  maesDivididas?: ReadonlyMap<string, LancamentoGrade>;
  /** "Dividir" / "Editar divisão" do menu ⋯ (a janela mostra por que não dá, se for o caso). */
  aoDividir?: (id: string) => void;
  cadastros: CadastrosGrade;
  ordem: Ordem;
  aoOrdenar: (coluna: ColunaOrdem) => void;
  /** Os escolhidos na coluna Responsável da barra de filtros: a `person-tag` fica marcada. */
  escolhidos: readonly ValorFiltro[];
  aoFiltrar: (responsavelId: string | null) => void;
  /** Texto da grade vazia. */
  vazio: string;
  /** Grade vazia pelos filtros: mostra "Limpar filtros" junto do texto. */
  aoLimparFiltros?: () => void;
  /** Conferência da Fatura do Mês: marca "verificar". Sem ela, nenhuma linha marcada. */
  conferencia?: Conferencia | null;
  /** Filtro "Verificar" ligado: na ordem padrão, dúvidas de extração primeiro. */
  verificando?: boolean;
  /** Ids selecionados (estado da tela, nada é gravado). */
  selecao?: ReadonlySet<string>;
  aoSelecionar?: (id: string) => void;
  /** Caixa do cabeçalho: marca ou desmarca as linhas da grade. */
  aoSelecionarTodos?: () => void;
  /** O Lançamento aberto no painel. */
  abertoId?: string | null;
  aoAbrir?: (id: string) => void;
  /** "Excluir" do menu ⋯ (a tela confirma). */
  aoExcluir?: (id: string) => void;
  /**
   * A linha aberta no painel que uma edição tirou do filtro: fica na grade
   * enquanto o painel estiver nela, mas não entra no total.
   */
  linhaFixa?: LancamentoGrade | null;
};

/** Nomes por id, para o núcleo ordenar pelo que a grade mostra. */
export function nomesDosCadastros(c: CadastrosGrade): NomesCadastros {
  const nomes = <V extends { nome: string }>(m: ReadonlyMap<string, V>) =>
    new Map([...m].map(([id, v]) => [id, v.nome] as const));
  return {
    tipos: c.tipos,
    responsaveis: nomes(c.responsaveis),
    status: nomes(c.status),
    lancadoPor: ROTULOS_LANCADO_POR,
  };
}

const COLUNAS: { coluna: ColunaOrdem; rotulo: string; classe?: string }[] = [
  { coluna: "nome", rotulo: C.nome, classe: "sticky left-11 z-30" },
  { coluna: "parcela", rotulo: C.parcela },
  { coluna: "valor", rotulo: C.valor, classe: "text-right" },
  { coluna: "tipo", rotulo: C.tipo },
  { coluna: "responsavel", rotulo: C.responsavel },
  { coluna: "lancado_por", rotulo: C.lancado_por },
  { coluna: "status", rotulo: C.status },
];

const CELULA = "h-linha border-b border-border-subtle px-2 whitespace-nowrap";
const CABECALHO = "sticky top-0 z-20 border-b border-border bg-surface px-2 text-left font-normal";
/** Caixa e Nome ficam fixos na rolagem lateral (fundo opaco por baixo). */
const FIXA_CAIXA = "sticky left-0 z-10 w-11";
const FIXA_NOME = "sticky left-11 z-10";

const CLASSES_CAIXA = "size-4.5 shrink-0 cursor-pointer accent-accent";

/** A caixa ocupa a célula inteira (44 pt de toque) e só seleciona. */
function Caixa({
  rotulo,
  estado,
  aoMudar,
}: {
  rotulo: string;
  estado: EstadoCaixa;
  aoMudar: () => void;
}) {
  return (
    <label className="flex min-h-toque w-full cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        aria-label={rotulo}
        checked={estado === "todos"}
        ref={(el) => {
          if (el) el.indeterminate = estado === "parcial";
        }}
        onChange={aoMudar}
        className={CLASSES_CAIXA}
      />
    </label>
  );
}

function Bolinha() {
  return <span className="mr-1.5 inline-block size-2 shrink-0 rounded-full bg-verify align-middle" />;
}

function Vazio() {
  return <span className="text-text-muted">{T.vazio}</span>;
}

function Cabecalho({
  ordem,
  aoOrdenar,
  estadoCaixa,
  aoSelecionarTodos,
}: {
  ordem: Ordem;
  aoOrdenar: (c: ColunaOrdem) => void;
  estadoCaixa: EstadoCaixa;
  aoSelecionarTodos: () => void;
}) {
  return (
    <thead>
      <tr>
        <th scope="col" className={cn(CABECALHO, "left-0 z-30 w-11")}>
          <span className="sr-only">{C.selecao}</span>
          <Caixa rotulo={TEXTOS_LANCAMENTO.selecionar_todos} estado={estadoCaixa} aoMudar={aoSelecionarTodos} />
        </th>
        {COLUNAS.map(({ coluna, rotulo, classe }) => {
          const ativa = ordem.coluna === coluna;
          return (
            <th
              key={coluna}
              scope="col"
              aria-sort={ativa ? (ordem.sentido === "crescente" ? "ascending" : "descending") : undefined}
              className={cn(CABECALHO, classe)}
            >
              <button
                type="button"
                onClick={() => aoOrdenar(coluna)}
                className={cn(
                  "inline-flex min-h-toque cursor-pointer items-center gap-1 texto-label text-text-muted",
                  ativa && "text-text",
                )}
              >
                {rotulo}
                {ativa ? <span aria-hidden>{ordem.sentido === "crescente" ? "▲" : "▼"}</span> : null}
              </button>
            </th>
          );
        })}
        <th scope="col" className={cn(CABECALHO, "w-14")}>
          <span className="sr-only">{C.acoes}</span>
        </th>
      </tr>
    </thead>
  );
}

const nada = () => {};

type PropsLinha = {
  l: LancamentoGrade;
  /** Num Ajuste: a mãe e todos os Ajustes dela (para o líquido). */
  mae: LancamentoGrade | null;
  ajustesDaMae: readonly LancamentoGrade[];
  cadastros: CadastrosGrade;
  escolhidos: readonly ValorFiltro[];
  aoFiltrar: (responsavelId: string | null) => void;
  verificar: boolean;
  selecionada: boolean;
  aberta: boolean;
  aoSelecionar: (id: string) => void;
  aoAbrir: (id: string) => void;
  aoExcluir: (id: string) => void;
  /** Cabeçalho da mãe dividida ou parte dela (História 3.8). */
  papel?: PapelNaGrade;
  aoDividir?: (id: string) => void;
};

/** Toque no corpo: abre o painel, menos na caixa, na `person-tag` e no ⋯ (e no menu, que fica num portal). */
function tocouNoCorpo(e: MouseEvent<HTMLElement>): boolean {
  const alvo = e.target;
  if (!(alvo instanceof Element) || !e.currentTarget.contains(alvo)) return false;
  return alvo.closest("input, label, a, button:not([data-corpo])") === null;
}

function LinhaGrade({
  l,
  mae,
  ajustesDaMae,
  cadastros,
  escolhidos,
  aoFiltrar,
  verificar,
  selecionada,
  aberta,
  aoSelecionar,
  aoAbrir,
  aoExcluir,
  papel,
  aoDividir,
}: PropsLinha) {
  const [menuAberto, setMenuAberto] = useState(false);
  const abrirMenu = useCallback(() => setMenuAberto(true), []);
  const toqueLongo = useToqueLongo(abrirMenu);
  const tipo = l.tipo_id === null ? undefined : cadastros.tipos.get(l.tipo_id);
  const responsavel = l.responsavel_id === null ? undefined : cadastros.responsaveis.get(l.responsavel_id);
  const status = l.status_id === null ? undefined : cadastros.status.get(l.status_id);
  const nome = nomeExibido(l);
  const previsto = ehPrevisto(l);
  // Com Apelido, o Nome original vai ao lado, em cinza.
  const temApelido = nome !== l.nome;
  const rotulo = rotuloLinhaAcessivel({
    nome,
    valorCentavos: l.valor_centavos,
    parcelaN: l.parcela_n,
    parcelaTotal: l.parcela_total,
    // O cabeçalho da Divisão não tem Responsável nem Status: são das partes.
    responsavel: papel === "cabecalho" ? "" : (responsavel?.nome ?? T.sem_responsavel),
    status: papel === "cabecalho" ? null : (status?.nome ?? null),
    verificar,
    previsto,
    ajuste: mae ? { nomeMae: nomeExibido(mae), liquidoCentavos: liquidoCentavos(mae, ajustesDaMae) } : undefined,
    parteDe: papel === "parte" ? nome : undefined,
    dividido: papel === "cabecalho",
  });
  const textoNome = (
    <>
      {verificar ? <Bolinha /> : null}
      {mae ? <span className="mr-1 text-text-muted">{TEXTOS_AJUSTE.marca}</span> : null}
      {papel === "parte" ? <span className="mr-1 text-text-muted">{TEXTOS_DIVISAO.marca}</span> : null}
      {temApelido ? (
        <>
          <span className="texto-body-strong">{nome}</span>{" "}
          <span className="text-text-muted">· {l.nome}</span>
        </>
      ) : previsto ? (
        <span className="text-text-muted">{l.nome}</span>
      ) : (
        l.nome
      )}
      {previsto ? (
        <span data-previsto className="ml-1.5 rounded-sm border border-border px-1.5 texto-caption text-text-muted">
          {ROTULO_PREVISTO}
        </span>
      ) : null}
    </>
  );
  const fundo = selecionada ? "bg-selection" : "bg-surface";
  return (
    <tr
      aria-label={rotulo}
      data-verificar={verificar || undefined}
      data-aberta={aberta || undefined}
      data-ajuste={mae ? true : undefined}
      data-papel={papel}
      className={cn("cursor-pointer select-none [-webkit-touch-callout:none]", selecionada && "bg-selection")}
      {...toqueLongo}
      onClick={(e) => {
        if (tocouNoCorpo(e)) aoAbrir(l.id);
      }}
    >
      <td className={cn(CELULA, FIXA_CAIXA, fundo, aberta && "shadow-[inset_3px_0_0_var(--color-accent-line)]")}>
        {/* O Ajuste não tem caixa: segue a seleção da mãe; o cabeçalho da Divisão também não (valem as partes). */}
        {mae || papel === "cabecalho" ? null : (
          <Caixa rotulo={rotuloSelecionar(nome)} estado={selecionada ? "todos" : "nenhum"} aoMudar={() => aoSelecionar(l.id)} />
        )}
      </td>
      <td className={cn(CELULA, FIXA_NOME, fundo)}>
        <button type="button" data-corpo className="flex min-h-linha w-full cursor-pointer items-center text-left">
          <span className="sr-only">{rotulo}</span>
          {mae ? (
            <span aria-hidden className="flex flex-col py-1 pl-4">
              <span data-nome>{textoNome}</span>
              <span data-liquido className="texto-caption text-text-muted">
                {textoLiquido(mae, ajustesDaMae)}
              </span>
            </span>
          ) : (
            <span aria-hidden data-nome className={cn(papel === "parte" && "pl-4")}>
              {textoNome}
            </span>
          )}
        </button>
      </td>
      <td className={cn(CELULA, "texto-number")}>{formatarParcela(l.parcela_n, l.parcela_total)}</td>
      <td className={cn(CELULA, "text-right texto-number", papel === "cabecalho" && "text-text-muted")}>
        {formatarDinheiro(l.valor_centavos)}
      </td>
      <td className={CELULA}>{tipo ?? <Vazio />}</td>
      <td className={CELULA}>
        {papel === "cabecalho" ? (
          <span className="rounded-sm border border-border px-1.5 texto-caption text-text-muted">{TEXTOS_DIVISAO.dividido}</span>
        ) : responsavel ? (
          <button
            type="button"
            aria-label={rotuloFiltrarPor(responsavel.nome)}
            aria-pressed={escolhidos.includes(l.responsavel_id)}
            onClick={() => aoFiltrar(l.responsavel_id)}
            className={cn(
              "area-toque inline-flex cursor-pointer items-center rounded-full px-2 texto-label",
              classesPessoa(responsavel.cor).etiqueta,
            )}
          >
            {responsavel.nome}
          </button>
        ) : (
          <Vazio />
        )}
      </td>
      <td className={CELULA}>
        <span className="rounded-sm border border-border px-1.5 texto-caption text-text-muted">
          {ROTULOS_LANCADO_POR[l.lancado_por]}
        </span>
      </td>
      <td className={CELULA}>
        {papel === "cabecalho" ? null : status ? (
          <span
            className={cn(
              "rounded-full px-2 texto-caption",
              status.conta_como_pago
                ? "bg-status-paid-bg text-status-paid-fg"
                : "bg-status-unpaid-bg text-status-unpaid-fg",
            )}
          >
            {status.nome}
          </span>
        ) : (
          <Vazio />
        )}
      </td>
      <td className={cn(CELULA, "text-right")}>
        <MenuAcoes
          rotulo={rotuloAcoesDe(mae ? rotuloAjusteDe(nomeExibido(mae)) : nome)}
          aberto={menuAberto}
          aoMudarAberto={setMenuAberto}
          itens={[
            { rotulo: TEXTOS_LANCAMENTO.abrir, aoEscolher: () => aoAbrir(l.id) },
            ...(aoDividir && !mae && papel !== "parte"
              ? [
                  {
                    rotulo: papel === "cabecalho" ? TEXTOS_DIVISAO.botao_editar : TEXTOS_DIVISAO.botao,
                    aoEscolher: () => aoDividir(l.id),
                  },
                ]
              : []),
            // A parte não se exclui: desfaz-se a divisão.
            ...(papel === "parte"
              ? []
              : [{ rotulo: TEXTOS_LANCAMENTO.excluir, aoEscolher: () => aoExcluir(l.id), destrutivo: true as const }]),
          ]}
        />
      </td>
    </tr>
  );
}

const SEM_AJUSTES: ReadonlyMap<string, readonly LancamentoGrade[]> = new Map();

const SEM_MAES: ReadonlyMap<string, LancamentoGrade> = new Map();

export function GradeLancamentos({
  linhas,
  ajustesPorMae = SEM_AJUSTES,
  maesDivididas = SEM_MAES,
  aoDividir,
  cadastros,
  ordem,
  aoOrdenar,
  escolhidos,
  aoFiltrar,
  vazio,
  aoLimparFiltros,
  conferencia = null,
  verificando = false,
  selecao = new Set(),
  aoSelecionar = nada,
  aoSelecionarTodos = nada,
  abertoId = null,
  aoAbrir = nada,
  aoExcluir = nada,
  linhaFixa = null,
}: PropsGradeLancamentos) {
  // A linha aberta que saiu do filtro continua na grade (opção A), fora do total.
  const comFixa = linhaFixa && !linhas.some((l) => l.id === linhaFixa.id) ? [...linhas, linhaFixa] : linhas;
  const ordenadas = agruparPartes(
    agruparComAjustes(ordenarGrade(comFixa, ordem, nomesDosCadastros(cadastros), verificando), ajustesPorMae),
    maesDivididas,
  );
  // O rodapé: as linhas visíveis (as mães filtradas e os Ajustes delas), fora a fixa.
  const visiveis = linhas.flatMap((l) => [l, ...(ajustesPorMae.get(l.id) ?? [])]);
  const estadoCaixa = estadoCaixaCabecalho(
    selecao,
    linhas.map((l) => l.id),
  );

  return (
    <div className="max-h-[75dvh] overflow-auto rounded-lg border border-border bg-surface">
      {/* PC: todas as colunas cabem; iPad em pé: rola para os lados. */}
      <table className="w-full min-w-240 border-separate border-spacing-0 texto-body">
        <caption className="sr-only">{T.grade}</caption>
        <Cabecalho ordem={ordem} aoOrdenar={aoOrdenar} estadoCaixa={estadoCaixa} aoSelecionarTodos={aoSelecionarTodos} />
        <tbody>
          {ordenadas.length === 0 ? (
            <tr>
              <td colSpan={9} className="p-6 text-center texto-body text-text-muted">
                <div className="flex flex-col items-center gap-3">
                  <span>{vazio}</span>
                  {aoLimparFiltros ? <Botao onClick={aoLimparFiltros}>{TEXTOS_FILTROS.limpar_filtros}</Botao> : null}
                </div>
              </td>
            </tr>
          ) : null}
          {ordenadas.map(({ linha: l, mae, papel }) => (
            <LinhaGrade
              key={l.id}
              l={l}
              mae={mae}
              papel={papel}
              aoDividir={aoDividir}
              ajustesDaMae={mae ? (ajustesPorMae.get(mae.id) ?? []) : []}
              cadastros={cadastros}
              escolhidos={escolhidos}
              aoFiltrar={aoFiltrar}
              verificar={conferencia !== null && precisaVerificar(l, conferencia)}
              selecionada={selecao.has(mae ? mae.id : l.id)}
              aberta={abertoId === l.id}
              aoSelecionar={aoSelecionar}
              aoAbrir={aoAbrir}
              aoExcluir={aoExcluir}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="texto-body-strong">
            <td colSpan={2} className={cn(CELULA, "sticky left-0 z-10 border-t border-border bg-surface")}>
              {T.total}
            </td>
            <td className={cn(CELULA, "border-t border-border")} />
            <td className={cn(CELULA, "border-t border-border text-right texto-number")}>
              {formatarDinheiro(somarValores(visiveis))}
            </td>
            <td colSpan={5} className={cn(CELULA, "border-t border-border")} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
