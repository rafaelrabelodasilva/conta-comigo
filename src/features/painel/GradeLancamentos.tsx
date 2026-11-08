"use client";

import { precisaVerificar, type Conferencia } from "@/domain/conferencia";
import { formatarDinheiro } from "@/domain/dinheiro";
import { formatarParcela } from "@/domain/importacao-fatura";
import {
  COLUNAS_GRADE as C,
  ROTULOS_LANCADO_POR,
  TEXTOS_PAINEL as T,
  rotuloFiltrarPor,
} from "@/domain/mensagens";
import {
  nomeExibido,
  ordenarGrade,
  rotuloLinhaAcessivel,
  somarValores,
  type ColunaOrdem,
  type FiltroResponsavel,
  type LancamentoGrade,
  type NomesCadastros,
  type Ordem,
} from "@/domain/painel";
import { cn } from "@/ui/cn";
import { classesPessoa } from "@/ui/cores-pessoa";

// Grade de Lançamentos do Mês (UX-DR10). Colunas: caixa (só visual nesta
// história), Nome (Apelido em negrito + Nome em cinza), Parcela, Valor,
// Tipo, Responsável (`person-tag`), Lançado por e Status (`status-pill`).
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

export type CadastroResponsavel = { nome: string; cor: number };
export type CadastroStatus = { nome: string; conta_como_pago: boolean };

export type CadastrosGrade = {
  tipos: ReadonlyMap<string, string>;
  responsaveis: ReadonlyMap<string, CadastroResponsavel>;
  status: ReadonlyMap<string, CadastroStatus>;
};

export type PropsGradeLancamentos = {
  /** Lançamentos do Mês aberto, já filtrados (sem excluídos). */
  linhas: readonly LancamentoGrade[];
  cadastros: CadastrosGrade;
  ordem: Ordem;
  aoOrdenar: (coluna: ColunaOrdem) => void;
  filtro: FiltroResponsavel;
  aoFiltrar: (responsavelId: string | null) => void;
  /** Texto da grade vazia. */
  vazio: string;
  /** Conferência da Fatura do Mês: marca "verificar". Sem ela, nenhuma linha marcada. */
  conferencia?: Conferencia | null;
  /** Filtro "Verificar" ligado: na ordem padrão, dúvidas de extração primeiro. */
  verificando?: boolean;
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
const FIXA_CAIXA = "sticky left-0 z-10 w-11 bg-surface";
const FIXA_NOME = "sticky left-11 z-10 bg-surface";

function Caixa() {
  return <span aria-hidden className="inline-block size-4.5 rounded-[5px] border-[1.5px] border-text-muted align-middle" />;
}

function Bolinha() {
  return <span className="mr-1.5 inline-block size-2 shrink-0 rounded-full bg-verify align-middle" />;
}

function Vazio() {
  return <span className="text-text-muted">{T.vazio}</span>;
}

function Cabecalho({ ordem, aoOrdenar }: { ordem: Ordem; aoOrdenar: (c: ColunaOrdem) => void }) {
  return (
    <thead>
      <tr>
        <th scope="col" className={cn(CABECALHO, "left-0 z-30 w-11")}>
          <span className="sr-only">{C.selecao}</span>
          <Caixa />
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
      </tr>
    </thead>
  );
}

export function GradeLancamentos({
  linhas,
  cadastros,
  ordem,
  aoOrdenar,
  filtro,
  aoFiltrar,
  vazio,
  conferencia = null,
  verificando = false,
}: PropsGradeLancamentos) {
  const ordenadas = ordenarGrade(linhas, ordem, nomesDosCadastros(cadastros), verificando);

  return (
    <div className="max-h-[75dvh] overflow-auto rounded-lg border border-border bg-surface">
      {/* PC: todas as colunas cabem; iPad em pé: rola para os lados. */}
      <table className="w-full min-w-240 border-separate border-spacing-0 texto-body">
        <caption className="sr-only">{T.grade}</caption>
        <Cabecalho ordem={ordem} aoOrdenar={aoOrdenar} />
        <tbody>
          {ordenadas.length === 0 ? (
            <tr>
              <td colSpan={8} className="p-6 text-center texto-body text-text-muted">
                {vazio}
              </td>
            </tr>
          ) : null}
          {ordenadas.map((l) => {
            const tipo = l.tipo_id === null ? undefined : cadastros.tipos.get(l.tipo_id);
            const responsavel = l.responsavel_id === null ? undefined : cadastros.responsaveis.get(l.responsavel_id);
            const status = l.status_id === null ? undefined : cadastros.status.get(l.status_id);
            const nome = nomeExibido(l);
            // Com Apelido, o Nome original vai ao lado, em cinza.
            const temApelido = nome !== l.nome;
            const verificar = conferencia !== null && precisaVerificar(l, conferencia);
            const rotulo = rotuloLinhaAcessivel({
              nome,
              valorCentavos: l.valor_centavos,
              parcelaN: l.parcela_n,
              parcelaTotal: l.parcela_total,
              responsavel: responsavel?.nome ?? T.sem_responsavel,
              status: status?.nome ?? null,
              verificar,
            });
            return (
              <tr key={l.id} aria-label={rotulo} data-verificar={verificar || undefined}>
                <td className={cn(CELULA, FIXA_CAIXA)}>
                  <Caixa />
                </td>
                <td className={cn(CELULA, FIXA_NOME)}>
                  <span className="sr-only">{rotulo}</span>
                  <span aria-hidden data-nome>
                    {verificar ? <Bolinha /> : null}
                    {temApelido ? (
                      <>
                        <span className="texto-body-strong">{nome}</span>{" "}
                        <span className="text-text-muted">· {l.nome}</span>
                      </>
                    ) : (
                      l.nome
                    )}
                  </span>
                </td>
                <td className={cn(CELULA, "texto-number")}>{formatarParcela(l.parcela_n, l.parcela_total)}</td>
                <td className={cn(CELULA, "text-right texto-number")}>{formatarDinheiro(l.valor_centavos)}</td>
                <td className={CELULA}>{tipo ?? <Vazio />}</td>
                <td className={CELULA}>
                  {responsavel ? (
                    <button
                      type="button"
                      aria-label={rotuloFiltrarPor(responsavel.nome)}
                      aria-pressed={filtro === l.responsavel_id}
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
                  {status ? (
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
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="texto-body-strong">
            <td colSpan={2} className={cn(CELULA, "sticky left-0 z-10 border-t border-border bg-surface")}>
              {T.total}
            </td>
            <td className={cn(CELULA, "border-t border-border")} />
            <td className={cn(CELULA, "border-t border-border text-right texto-number")}>
              {formatarDinheiro(somarValores(ordenadas))}
            </td>
            <td colSpan={4} className={cn(CELULA, "border-t border-border")} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
