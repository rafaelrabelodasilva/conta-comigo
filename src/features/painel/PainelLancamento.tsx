"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { liquidoCentavos, somaDosAjustes } from "@/domain/ajustes";
import { lerDadosRevisao } from "@/domain/classificacao";
import type { ConfigCiclo } from "@/domain/ciclo";
import type { Conferencia } from "@/domain/conferencia";
import { formatarHora, instanteEmMicros } from "@/domain/datas";
import { formatarDinheiro } from "@/domain/dinheiro";
import { ehDividaProgramada } from "@/domain/divida";
import { ehFilha, ehMaeDividida, lerDivisao, valoresDasPartes } from "@/domain/divisao";
import { formatarParcela } from "@/domain/importacao-fatura";
import {
  FORM_NOVO_VAZIO,
  alteradoEmOutroAparelho,
  mudancaDoCampo,
  novoLancamento,
  opcoesDoCadastro,
  textoConferenciaDoLancamento,
  textoDoCampo,
  type CampoLancamento,
  type CampoNovo,
  type FormNovoLancamento,
  type MudancaCampo,
} from "@/domain/lancamento";
import {
  ROTULOS,
  ROTULOS_LANCADO_POR,
  ROTULO_ATRASADO,
  ROTULO_PREVISTO,
  TEXTOS_AJUSTE,
  TEXTOS_DIVIDA,
  TEXTOS_LANCAMENTO as T,
  TEXTOS_PAGAMENTO as TP,
  TEXTOS_PAINEL,
  mensagem,
  mensagemDoPagamento,
  perguntaAplicarAosPrevistos,
  perguntaApelidoEmMassa,
  rotuloAjusteDaMae,
  rotuloAlteradoEmOutroAparelho,
  rotuloCartaoFinal,
  rotuloDesdeDoAtraso,
  rotuloDetalhesLancamento,
  rotuloFalta,
  rotuloIncluidoEm,
  rotuloOrigemPrevisto,
  rotuloProgramada,
  rotuloApelidoAplicado,
  rotuloPrevistosAtualizados,
  rotuloSalvoAs,
  rotuloSegueAParcela,
  textoSugestao,
} from "@/domain/mensagens";
import { nomeExibido } from "@/domain/painel";
import { recusarStatusNaoPago } from "@/domain/pagamento";
import { TEXTOS_DIVISAO, rotuloParteDe, rotuloResumoDaDivisao } from "@/domain/mensagens";
import { ehPrevisto, type MudancaDoPrevisto } from "@/domain/previstos";
import { ordenarParaConfiguracoes as ordenarResponsaveis } from "@/domain/responsaveis";
import { ordenarParaConfiguracoes as ordenarStatus } from "@/domain/status";
import { ordenarParaConfiguracoes as ordenarTipos } from "@/domain/tipos";
import {
  mudancaDaColuna,
  repoLancamentos,
  type LinhaLancamento,
  type RepoLancamentos,
} from "@/data/lancamentos-repo";
import type { LinhaDe } from "@/data/realtime";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { cn } from "@/ui/cn";
import { FaixaPergunta } from "@/ui/FaixaPergunta";
import { Interruptor } from "@/ui/Interruptor";
import type { PlanoDoApelido } from "@/domain/apelido";
import { Seletor, type OpcaoSeletor } from "@/ui/Seletor";
import { SeloStatus } from "@/ui/SeloStatus";
import { useToast } from "@/ui/Toast";

// Painel do Lançamento (`side-panel`, História 2.7, UX-DR14, mockup
// `lancamento.html`). Abre pela direita sem véu: a grade continua visível.
// iPad deitado e PC (`lg`+): 400 px; iPad em pé: 70% da largura.
//
// Editar: cada campo salva ao sair dele (seletor: ao mudar), só se o valor
// mudou em relação à memória, mandando só aquela coluna e `editado_em`, com
// otimismo. O indicador do topo diz "Salvando…", "Salvo às HH:MM" ou "Não
// salvo, tentando de novo". Falhou: tenta de novo sozinho até 3 vezes (2 s,
// 5 s, 10 s) enquanto o campo tiver o mesmo valor; depois, o campo volta ao
// gravado e aparece "Não foi possível salvar. Tente de novo.". Sem conexão,
// nada começa: o campo volta ao gravado e o toast avisa. Erro de validação
// fica no campo, com o que foi digitado.
//
// "Alterado em outro aparelho": chegou uma versão mais nova que não veio de
// uma gravação deste painel; a faixa diz a hora e os campos que não estão em
// edição mostram o valor novo (o campo em edição guarda o que foi digitado).
//
// Incluir ("＋ Lançamento"): o mesmo painel vazio, com o Nome editável e
// "Cancelar" / "Incluir"; nada é gravado antes de "Incluir". As regras são do
// núcleo (`src/domain/lancamento.ts`).
//
// Ajustes de centavos (História 2.8): no painel do Ajuste, Tipo e
// Responsável ficam só para leitura ("Segue a parcela NOME") e o rodapé tem
// "Desvincular" (toast "Desvinculado · Desfazer", que religa e copia a
// classificação atual da mãe). No painel da mãe, a linha "Ajuste - R$ 0,08 ·
// líquido R$ 1.140,66", e mudar Tipo ou Responsável grava a mãe e os
// Ajustes dela na mesma requisição.
//
// Previstos (História 3.5): o previsto leva o selo "Previsto" e a origem
// ("criado a partir da parcela 05/10 de MAGALU na Fatura de 06/10/26", lida do
// banco). Mudar Tipo ou Responsável de uma parcela real com previstos preenche
// sozinho os previstos vazios; se há previstos com outro valor, a faixa
// "Só este" / "Aplicar a todos" pergunta (decisão 4-A).
//
// Sugestão da fila (História 3.1): na linha que a importação mandou para o
// Revisar com sugestão, o texto "Sugestão: Casal · Saúde (às vezes Rafael)"
// fica sob os seletores. Só texto: a grade e os seletores não mudam.

/** Atrasos das novas tentativas automáticas, em ms. */
export const ATRASOS_NOVA_TENTATIVA = [2000, 5000, 10000] as const;

type Cadastro<T extends "responsaveis" | "tipos" | "status"> = LinhaDe<T>;

export type CadastrosPainel = {
  responsaveis: readonly Cadastro<"responsaveis">[];
  tipos: readonly Cadastro<"tipos">[];
  status: readonly Cadastro<"status">[];
};

/** "Pago parcialmente · falta R$ 115,16" (derivado, nunca gravado): o selo e o que falta, anunciado quando muda. */
function FaltaDoParcial({ centavos }: { centavos: number }) {
  return (
    <p role="status" className="flex flex-wrap items-center gap-2 texto-caption text-text-muted">
      <SeloStatus variante="parcial">{TP.pago_parcialmente}</SeloStatus>
      <span className="whitespace-nowrap">{rotuloFalta(centavos)}</span>
    </p>
  );
}

/** "Atrasado · desde 17/11/26" (6.4, derivado, nunca gravado): o selo e o primeiro dia de atraso. */
function AtrasoDoLancamento({ desde }: { desde: string }) {
  return (
    <p role="status" className="flex flex-wrap items-center gap-2 texto-caption text-text-muted">
      <SeloStatus variante="atrasado">{ROTULO_ATRASADO}</SeloStatus>
      <span className="whitespace-nowrap">{rotuloDesdeDoAtraso(desde)}</span>
    </p>
  );
}

/**
 * "Dívida programada" (6.6, FR-27, UX-DR19): liga ou desliga, com a data. Ligar abre a janela "Programar
 * dívida" (a mesma da barra de Seleção e do ⋯ da grade, que fica no Painel); desligar grava na hora, com
 * "Desfazer" no aviso. Programada: o selo "Programada · 06/04/27", "Editar" (reabre a janela com a data) e a
 * observação do combinado. Pago e sem Dívida: só o aviso, não há o que programar.
 */
function DividaDoLancamento({
  linha,
  pago,
  aoProgramar,
  aoDesprogramar,
}: {
  linha: LinhaLancamento;
  pago: boolean;
  aoProgramar: (id: string) => void;
  aoDesprogramar: (id: string) => void;
}) {
  const programada = ehDividaProgramada(linha);
  if (!programada && pago) return <p className="texto-caption text-text-muted">{TEXTOS_DIVIDA.ja_pago}</p>;
  return (
    <div className="flex flex-col gap-1">
      <Interruptor
        rotulo={TEXTOS_DIVIDA.campo}
        ligado={programada}
        aoMudar={(ligar) => (ligar ? aoProgramar(linha.id) : aoDesprogramar(linha.id))}
      />
      {programada ? (
        <>
          <p role="status" className="flex flex-wrap items-center gap-2 texto-caption text-text-muted">
            <SeloStatus variante="programada">{rotuloProgramada(linha.vencimento_combinado as string)}</SeloStatus>
            <Botao tamanho="compacto" onClick={() => aoProgramar(linha.id)}>
              {TEXTOS_DIVIDA.editar}
            </Botao>
          </p>
          {linha.vencimento_observacao ? (
            <p className="texto-caption text-text-muted">{linha.vencimento_observacao}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

type Comum = {
  cadastros: CadastrosPainel;
  /**
   * Os Status que contam como pago e os Lançamentos que um Pagamento quitou (História 6.1, AD-10):
   * tirar à mão o "pago" de uma linha quitada por Pagamento é recusado ("desfaça o pagamento antes").
   * Uma linha só parcialmente paga não entra: ela troca de "não pago" para outro à vontade (6.2).
   */
  statusPagos?: ReadonlySet<string>;
  quitadasPorPagamento?: ReadonlySet<string>;
  /** "falta R$ X" de um Pago parcialmente (derivado do núcleo, 6.2); `null` nas demais linhas. */
  faltaCentavos?: number | null;
  /** Atrasado (6.4): o primeiro dia de atraso desta linha (`atrasosDasLinhas` do núcleo); `null` se não está atrasada. */
  atrasadoDesde?: string | null;
  /** Dívida programada (6.6): "Programar dívida" abre a janela da data (o Painel a guarda); sem ele, o campo não aparece. */
  aoProgramar?: (id: string) => void;
  /** Desliga a Dívida programada na hora (o Painel grava e mostra o "Desfazer"). */
  aoDesprogramar?: (id: string) => void;
  aoFechar: () => void;
  /** Para os testes; padrão, o repositório do navegador. */
  repo?: RepoLancamentos;
};

export type PropsPainelLancamento = Comum &
  (
    | {
        modo: "editar";
        linha: LinhaLancamento;
        /** A linha é Ajuste desta mãe (do Mês aberto). */
        mae?: LinhaLancamento | null;
        /** Os Ajustes da linha (ela é mãe): acompanham o Tipo e o Responsável. */
        ajustes?: readonly LinhaLancamento[];
        /** A linha atual da memória (o "Desfazer" do "Desvincular" lê a mãe). */
        lerLinha?: (id: string) => LinhaLancamento | undefined;
        conferencia: Conferencia | null;
        /** "Excluir" do rodapé (a tela confirma). */
        aoExcluir: (id: string) => void;
        /** As filhas da linha (ela é mãe dividida): acompanham Tipo, Apelido, Observação e data. */
        filhas?: readonly LinhaLancamento[];
        /** A mãe da linha (ela é uma parte de uma Divisão, História 3.8). */
        maeDaParte?: LinhaLancamento | null;
        /** "Dividir" / "Editar divisão" / "Abrir divisão": abre a janela da mãe. */
        aoDividir?: (id: string) => void;
      }
    | {
        modo: "novo";
        mesAberto: string;
        /** A Fatura do Mês aberto, se houver: mostra "Corrige a leitura da fatura". */
        fatura: { id: string; mes: string } | null;
        /** Os finais de `fatura_cartoes` dessa Fatura. */
        cartoes: readonly string[];
        configsCiclo: readonly ConfigCiclo[];
        /** Status das linhas novas (`configuracoes.status_padrao_id`). */
        statusPadraoId: string | null;
        aoIncluido: (linha: LinhaLancamento) => void;
      }
  );

const CLASSES_PAINEL =
  "fixed inset-y-0 right-0 z-30 flex w-[70vw] flex-col border-l border-border bg-surface text-text shadow-lateral lg:w-painel-lateral";

function Moldura({
  titulo,
  topo,
  aoFechar,
  rodape,
  children,
}: {
  titulo: string;
  topo?: ReactNode;
  aoFechar: () => void;
  rodape: ReactNode;
  children: ReactNode;
}) {
  const idTitulo = useId();
  const cabecalho = useRef<HTMLHeadingElement>(null);
  // Ao abrir (e ao trocar de Lançamento), o foco vai para o título.
  useEffect(() => {
    cabecalho.current?.focus();
  }, []);
  return (
    <aside aria-labelledby={idTitulo} className={CLASSES_PAINEL}>
      <div className="flex min-h-toque items-center gap-2 border-b border-border-subtle px-4 py-2">
        <h2 id={idTitulo} ref={cabecalho} tabIndex={-1} className="min-w-0 flex-1 truncate texto-title outline-none">
          {titulo}
        </h2>
        {topo}
        <Botao tamanho="compacto" aria-label={ROTULOS.fechar} onClick={aoFechar}>
          <span aria-hidden>✕</span>
        </Botao>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">{children}</div>
      <div className="flex items-center gap-2 border-t border-border-subtle px-4 py-3">{rodape}</div>
    </aside>
  );
}

function Observacao({
  valor,
  erro,
  aoMudar,
  aoFocar,
  aoSair,
}: {
  valor: string;
  erro?: string | null;
  aoMudar: (texto: string) => void;
  aoFocar?: () => void;
  aoSair?: () => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="texto-label text-text">
        {T.observacao}
      </label>
      <textarea
        id={id}
        rows={3}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        onFocus={aoFocar}
        onBlur={aoSair}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={cn(
          "min-h-toque w-full rounded-sm border border-border bg-background px-3 py-2 texto-body text-text",
          erro && "border-danger-fg",
        )}
      />
      {erro ? (
        <p id={`${id}-erro`} className="texto-label font-normal text-danger-fg">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

/** "Sugestão: …" de uma linha com `revisao_motivo` de sugestão (só cadastros ativos); senão, null. */
function sugestaoDaLinha(linha: LinhaLancamento, cadastros: CadastrosPainel): string | null {
  if (linha.revisao_motivo !== "sugestao" && linha.revisao_motivo !== "sugestao_duvida") return null;
  const dados = lerDadosRevisao(linha.revisao_dados);
  if (!dados) return null;
  // Cadastro arquivado ou que não existe mais não aparece na sugestão.
  const nome = (lista: readonly { id: string; nome: string; arquivado: boolean }[], id: string | null) =>
    id === null ? null : (lista.find((c) => c.id === id && !c.arquivado)?.nome ?? null);
  const outros = dados.outros_responsaveis
    .map((id) => nome(cadastros.responsaveis, id))
    .filter((n): n is string => n !== null);
  return textoSugestao(nome(cadastros.responsaveis, dados.responsavel_id), nome(cadastros.tipos, dados.tipo_id), outros);
}

/** O selo "Previsto" e a origem da linha, lida do banco (a linha de origem pode estar em outro Mês). */
function OrigemDoPrevisto({ origemId, repo }: { origemId: string | null; repo: RepoLancamentos }) {
  const [texto, setTexto] = useState<string | null>(null);
  useEffect(() => {
    if (origemId === null) return;
    let vivo = true;
    void repo.lerOrigem(origemId).then((r) => {
      if (!vivo || !r.ok) return;
      setTexto(
        rotuloOrigemPrevisto(
          r.origem === null
            ? null
            : {
                nome: r.origem.nome,
                parcela: formatarParcela(r.origem.parcela_n, r.origem.parcela_total),
                vencimento: r.origem.vencimento,
              },
        ),
      );
    });
    return () => {
      vivo = false;
    };
  }, [origemId, repo]);
  const origem = origemId === null ? rotuloOrigemPrevisto(null) : texto;
  return (
    <p className="flex flex-wrap items-center gap-2 texto-body text-text-muted">
      <span data-previsto className="rounded-sm border border-border px-1.5 texto-caption">
        {ROTULO_PREVISTO}
      </span>
      {origem ? <span data-origem>{origem}</span> : null}
    </p>
  );
}

function opcoesDosCadastros(cadastros: CadastrosPainel, atual: { responsavel: string | null; tipo: string | null; status: string | null }) {
  return {
    responsavel: opcoesDoCadastro(ordenarResponsaveis(cadastros.responsaveis), atual.responsavel, TEXTOS_PAINEL.sem_responsavel),
    tipo: opcoesDoCadastro(ordenarTipos(cadastros.tipos), atual.tipo, T.sem_tipo),
    status: opcoesDoCadastro(ordenarStatus(cadastros.status), atual.status, T.sem_status),
  } satisfies Record<string, OpcaoSeletor[]>;
}

export function PainelLancamento(props: PropsPainelLancamento) {
  return props.modo === "editar" ? <EditarLancamento {...props} /> : <IncluirLancamento {...props} />;
}

// --------------------------------------------------------------- Editar

type EstadoCampo = "salvando" | "tentando";

const SEM_AJUSTES: readonly LinhaLancamento[] = [];

/** Os campos que o Ajuste segue da mãe. */
const SEGUEM_A_MAE: readonly CampoLancamento[] = ["tipo", "responsavel"];

/** Os campos que as filhas de uma Divisão seguem da mãe (o Valor, o Responsável e o Status são delas). */
const SEGUEM_AS_FILHAS: readonly CampoLancamento[] = ["tipo", "apelido", "observacao", "data"];

const SEM_FILHAS: readonly LinhaLancamento[] = [];
const SEM_IDS: ReadonlySet<string> = new Set();

function EditarLancamento({
  linha,
  mae = null,
  ajustes = SEM_AJUSTES,
  filhas = SEM_FILHAS,
  maeDaParte = null,
  aoDividir,
  lerLinha,
  conferencia,
  cadastros,
  statusPagos = SEM_IDS,
  quitadasPorPagamento = SEM_IDS,
  faltaCentavos = null,
  atrasadoDesde = null,
  aoProgramar,
  aoDesprogramar,
  aoFechar,
  aoExcluir,
  repo: repoDado,
}: Extract<PropsPainelLancamento, { modo: "editar" }>) {
  const repo = repoDado ?? repoLancamentos();
  const toast = useToast();
  const [rascunhos, setRascunhosEstado] = useState<Partial<Record<CampoLancamento, string>>>({});
  const [erros, setErros] = useState<Partial<Record<CampoLancamento, string>>>({});
  const [estados, setEstados] = useState<Partial<Record<CampoLancamento, EstadoCampo>>>({});
  const [salvoAs, setSalvoAs] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [alteradoAs, setAlteradoAs] = useState<string | null>(null);
  // Previstos com outro valor, à espera do "Só este" / "Aplicar a todos" (História 3.5).
  const [aPerguntar, setAPerguntar] = useState<MudancaDoPrevisto[]>([]);
  // Apelido em massa (História 3.9): as outras linhas do mesmo Nome, à espera do "Só este" / "Aplicar a todos".
  const [apelidoPendente, setApelidoPendente] = useState<{ plano: PlanoDoApelido; depois: string | null; nome: string } | null>(null);

  // Refs para as gravações assíncronas lerem o estado atual.
  const rascunhosRef = useRef(rascunhos);
  const linhaRef = useRef(linha);
  const ajustesRef = useRef(ajustes);
  const filhasRef = useRef(filhas);
  const maeRef = useRef(mae);
  const focado = useRef<CampoLancamento | null>(null);
  const emVoo = useRef(0);
  const visto = useRef(linha.updated_at);
  const gravadosAqui = useRef<string[]>([]);
  const temporizadores = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    linhaRef.current = linha;
    ajustesRef.current = ajustes;
    filhasRef.current = filhas;
    if (mae) maeRef.current = mae;
  });
  // Fechado (Esc, outra linha, outro Mês): sem novas tentativas; a falha vira toast.
  const montado = useRef(false);
  const salvarRef = useRef<(campo: CampoLancamento, texto: string) => void>(() => {});
  useEffect(() => {
    salvarRef.current = salvar;
  });
  useEffect(() => {
    montado.current = true;
    const t = temporizadores.current;
    const emFoco = focado;
    const rascunhosAtuais = rascunhosRef;
    const salvarAtual = salvarRef;
    return () => {
      montado.current = false;
      for (const h of t) clearTimeout(h);
      t.clear();
      // Fechar sem sair do campo não perde o que foi digitado nele.
      const campo = emFoco.current;
      const rascunho = campo === null ? undefined : rascunhosAtuais.current[campo];
      if (campo !== null && rascunho !== undefined) salvarAtual.current(campo, rascunho);
    };
  }, []);

  const setRascunhos = useCallback((mudar: (r: Partial<Record<CampoLancamento, string>>) => Partial<Record<CampoLancamento, string>>) => {
    rascunhosRef.current = mudar(rascunhosRef.current);
    setRascunhosEstado(rascunhosRef.current);
  }, []);
  const definirRascunho = (campo: CampoLancamento, texto: string | undefined) =>
    setRascunhos((r) => {
      const novo = { ...r };
      if (texto === undefined) delete novo[campo];
      else novo[campo] = texto;
      return novo;
    });
  const definirEstado = (campo: CampoLancamento, estado: EstadoCampo | undefined) =>
    setEstados((e) => {
      const novo = { ...e };
      if (estado === undefined) delete novo[campo];
      else novo[campo] = estado;
      return novo;
    });
  const definirErro = (campo: CampoLancamento, erro: string | undefined) =>
    setErros((e) => {
      if (e[campo] === erro) return e;
      const novo = { ...e };
      if (erro === undefined) delete novo[campo];
      else novo[campo] = erro;
      return novo;
    });

  /** Chegou versão nova de outro aparelho? Só sem gravação deste painel em voo. */
  const avaliar = useCallback(() => {
    if (emVoo.current > 0) return;
    const atual = linhaRef.current.updated_at;
    if (alteradoEmOutroAparelho(visto.current, atual, gravadosAqui.current)) setAlteradoAs(atual);
    if (instanteEmMicros(atual) > instanteEmMicros(visto.current) || Number.isNaN(instanteEmMicros(visto.current))) {
      visto.current = atual;
    }
  }, []);
  useEffect(() => {
    avaliar();
  }, [linha.updated_at, avaliar]);

  async function tentar(campo: CampoLancamento, texto: string, mudanca: MudancaCampo, tentativa: number) {
    emVoo.current++;
    definirEstado(campo, "salvando");
    setFalhou(false);
    // Tipo e Responsável da mãe vão também para os Ajustes dela, e Tipo, Apelido, Observação e data
    // para as filhas de uma Divisão, na mesma requisição.
    const junto = [
      ...(SEGUEM_A_MAE.includes(campo) ? ajustesRef.current.map((a) => a.id) : []),
      ...(SEGUEM_AS_FILHAS.includes(campo) ? filhasRef.current.map((f) => f.id) : []),
    ];
    const antes = { responsavel_id: linhaRef.current.responsavel_id, tipo_id: linhaRef.current.tipo_id };
    const r =
      junto.length > 0
        ? await repo.atualizar(linhaRef.current.id, mudancaDaColuna(mudanca), { junto })
        : await repo.atualizar(linhaRef.current.id, mudancaDaColuna(mudanca));
    emVoo.current--;
    if (r.ok) {
      gravadosAqui.current.push(r.linha.updated_at);
      setSalvoAs(formatarHora(r.linha.updated_at));
      definirEstado(campo, undefined);
      if (SEGUEM_A_MAE.includes(campo)) void propagar(antes, r.linha);
      if (campo === "apelido") void perguntarApelido(r.linha);
      // O campo passa a mostrar a memória (já com o valor gravado, formatado).
      if (focado.current !== campo && rascunhosRef.current[campo] === texto) definirRascunho(campo, undefined);
    } else if (r.codigo === "conexao.gravar_sem_conexao") {
      definirEstado(campo, undefined);
      if (rascunhosRef.current[campo] === texto) definirRascunho(campo, undefined);
      toast.mostrar({ texto: mensagem(r.codigo) });
    } else if (!montado.current) {
      toast.mostrar({ texto: mensagem("salvar.falhou") });
    } else if (tentativa < ATRASOS_NOVA_TENTATIVA.length) {
      definirEstado(campo, "tentando");
      const h = setTimeout(() => {
        temporizadores.current.delete(h);
        // Só enquanto o campo continuar com o mesmo valor.
        if (rascunhosRef.current[campo] !== texto) {
          definirEstado(campo, undefined);
          return;
        }
        void tentar(campo, texto, mudanca, tentativa + 1);
      }, ATRASOS_NOVA_TENTATIVA[tentativa]);
      temporizadores.current.add(h);
    } else {
      definirEstado(campo, undefined);
      if (rascunhosRef.current[campo] === texto) definirRascunho(campo, undefined);
      setFalhou(true);
    }
    avaliar();
  }

  /** Previstos da Série: preenche os vazios e guarda os com outro valor para a pergunta (decisão 4-A). */
  async function propagar(antes: { responsavel_id: string | null; tipo_id: string | null }, gravada: LinhaLancamento) {
    if (!gravada.serie_id || ehPrevisto(gravada)) return;
    const r = await repo.propagarAosPrevistos([
      {
        serie_id: gravada.serie_id,
        parcela_n: gravada.parcela_n,
        lancado_por: gravada.lancado_por,
        antes,
        depois: { responsavel_id: gravada.responsavel_id, tipo_id: gravada.tipo_id },
      },
    ]);
    // A gravação do campo já valeu: a falha só deixa os previstos como estão.
    if (!r.ok) return;
    if (montado.current) setAPerguntar(r.aPerguntar);
  }

  /** Apelido em massa: as outras linhas do mesmo Nome que mudariam; só pergunta se houver alguma. */
  async function perguntarApelido(gravada: LinhaLancamento) {
    if ((gravada.ajuste_de_id ?? null) !== null || (gravada.dividido_de_id ?? null) !== null) return;
    setApelidoPendente(null);
    try {
      const r = await repo.planejarApelido({ id: gravada.id, nome_normalizado: gravada.nome_normalizado }, gravada.apelido);
      // A gravação do campo já valeu: a falha só deixa as outras linhas como estão.
      if (!r.ok || r.plano.mudam === 0 || !montado.current) return;
      setApelidoPendente({ plano: r.plano, depois: gravada.apelido, nome: gravada.nome });
    } catch {
      // Sem pergunta; o Apelido da linha aberta já está gravado.
    }
  }

  async function responderApelido(resposta: "so_este" | "aplicar_a_todos") {
    const pendente = apelidoPendente;
    setApelidoPendente(null);
    if (resposta === "so_este" || pendente === null) return;
    const r = await repo.aplicarApelido(pendente.plano.itens);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return;
    }
    toast.mostrar({
      texto: rotuloApelidoAplicado(pendente.plano.mudam, pendente.depois === null),
      aoDesfazer: () => {
        void repo.aplicarApelido(pendente.plano.antes).then((d) => {
          if (!d.ok) toast.mostrar({ texto: mensagem(d.codigo) });
        });
      },
    });
  }

  async function responderPrevistos(resposta: "so_este" | "aplicar_a_todos") {
    const pendentes = aPerguntar;
    setAPerguntar([]);
    if (resposta === "so_este" || pendentes.length === 0) return;
    const r = await repo.aplicarAosPrevistos(pendentes);
    toast.mostrar({ texto: r.ok ? rotuloPrevistosAtualizados(r.gravados) : mensagem(r.codigo) });
  }

  function salvar(campo: CampoLancamento, texto: string) {
    const r = mudancaDoCampo(linhaRef.current, campo, texto);
    if (!r.ok) {
      definirErro(campo, mensagem(r.erro.codigo));
      return;
    }
    definirErro(campo, undefined);
    if (r.valor === null) {
      definirRascunho(campo, undefined);
      return;
    }
    // Aplicar à mão um Status "não pago" numa linha com Pagamento: recusado, o Pagamento se desfaz antes (AD-10).
    if (r.valor.coluna === "status_id") {
      const recusa = recusarStatusNaoPago(r.valor.valor, statusPagos, [linhaRef.current], quitadasPorPagamento);
      if (!recusa.ok) {
        definirErro(campo, mensagemDoPagamento(recusa.erro));
        definirRascunho(campo, undefined);
        return;
      }
    }
    void tentar(campo, texto, r.valor, 0);
  }

  const texto = (campo: CampoLancamento) => rascunhos[campo] ?? textoDoCampo(linha, campo);

  /** Registra uma gravação deste painel (não é "alterado em outro aparelho"). */
  function gravadoAqui(updatedAt: string) {
    gravadosAqui.current.push(updatedAt);
    setSalvoAs(formatarHora(updatedAt));
  }

  async function desvincular() {
    const id = linhaRef.current.id;
    const maeId = linhaRef.current.ajuste_de_id;
    emVoo.current++;
    const r = await repo.desvincular(id);
    emVoo.current--;
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      avaliar();
      return;
    }
    gravadoAqui(r.linha.updated_at);
    avaliar();
    toast.mostrar({
      texto: TEXTOS_AJUSTE.desvinculado,
      aoDesfazer: () => {
        // A classificação atual da mãe (pode ter mudado depois de desvincular).
        const atual = maeId === null ? undefined : (lerLinha?.(maeId) ?? (maeRef.current?.id === maeId ? maeRef.current : undefined));
        if (!atual || atual.excluido_em !== null) {
          toast.mostrar({ texto: mensagem("salvar.falhou") });
          return;
        }
        if (montado.current) emVoo.current++;
        void repo.religar(id, atual).then((d) => {
          if (montado.current) {
            emVoo.current--;
            if (d.ok) gravadoAqui(d.linha.updated_at);
            avaliar();
          }
          if (!d.ok) toast.mostrar({ texto: mensagem(d.codigo) });
        });
      },
    });
  }

  function focar(campo: CampoLancamento) {
    focado.current = campo;
    if (rascunhosRef.current[campo] === undefined) definirRascunho(campo, textoDoCampo(linhaRef.current, campo));
  }
  function sair(campo: CampoLancamento) {
    focado.current = null;
    const atual = rascunhosRef.current[campo];
    if (atual !== undefined) salvar(campo, atual);
  }
  function escolher(campo: CampoLancamento, valor: string) {
    definirRascunho(campo, valor);
    salvar(campo, valor);
  }

  const opcoes = opcoesDosCadastros(cadastros, {
    responsavel: linha.responsavel_id,
    tipo: linha.tipo_id,
    status: linha.status_id,
  });
  const textoConferencia = textoConferenciaDoLancamento(linha, conferencia);
  const sugestao = sugestaoDaLinha(linha, cadastros);
  const idSugestao = useId();
  const nomeDoCadastro = (lista: readonly { id: string; nome: string }[], id: string | null, sem: string) =>
    id === null ? sem : (lista.find((c) => c.id === id)?.nome ?? sem);
  const maeDividida = ehMaeDividida(linha);
  // Já pago (Status que conta ou quitado por Pagamento): não há o que programar (6.6).
  const pagoOuQuitada = (linha.status_id !== null && statusPagos.has(linha.status_id)) || quitadasPorPagamento.has(linha.id);
  const divisao = maeDividida ? lerDivisao(linha.divisao) : null;
  // "Mãe 2/3 · Rafael 1/3" (por valor: "Mãe R$ 310,67 · Rafael R$ 155,33").
  const resumoDaDivisao = (() => {
    if (!divisao) return "";
    const valores = divisao.modo === "valor" ? valoresDasPartes(linha.valor_centavos, divisao) : null;
    return rotuloResumoDaDivisao(
      divisao.partes.map((p, i) => ({
        nome: nomeDoCadastro(cadastros.responsaveis, p.responsavel_id, TEXTOS_PAINEL.sem_responsavel),
        fracao: valores?.ok ? formatarDinheiro(valores.valor[i]) : `${p.numerador}/${p.denominador}`,
      })),
    );
  })();

  const situacao = Object.values(estados);
  let indicador: ReactNode = null;
  if (situacao.includes("salvando")) indicador = T.salvando;
  else if (situacao.includes("tentando")) indicador = T.tentando;
  else if (falhou) indicador = <span className="text-danger-fg">{mensagem("salvar.falhou")}</span>;
  else if (salvoAs) indicador = rotuloSalvoAs(salvoAs);

  // Uma parte da Divisão: só o Status é dela; o resto é lido da mãe (Dividir > Editar divisão).
  if (ehFilha(linha)) {
    const maeNome = maeDaParte ? nomeExibido(maeDaParte) : linha.nome;
    return (
      <Moldura
        titulo={rotuloParteDe(maeNome)}
        aoFechar={aoFechar}
        topo={
          <p role="status" className="shrink-0 texto-caption text-text-muted">
            {indicador}
          </p>
        }
        rodape={
          <div className="ml-auto flex gap-2">
            {aoDividir && maeDaParte ? (
              <Botao onClick={() => aoDividir(maeDaParte.id)}>{TEXTOS_DIVISAO.abrir_divisao}</Botao>
            ) : null}
          </div>
        }
      >
        <p className="texto-body text-text-muted">
          {T.nome_na_fatura} <span className="texto-body-strong text-text">{linha.nome}</span> {T.nao_editavel}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <span className="texto-label text-text">{T.valor}</span>
            <span className="flex min-h-toque items-center texto-body texto-number text-text">{formatarDinheiro(linha.valor_centavos)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="texto-label text-text">{T.responsavel}</span>
            <span className="flex min-h-toque items-center texto-body text-text">
              {nomeDoCadastro(cadastros.responsaveis, linha.responsavel_id, TEXTOS_PAINEL.sem_responsavel)}
            </span>
          </div>
        </div>
        <p className="texto-caption text-text-muted">
          {maeDaParte ? `${rotuloParteDe(maeNome)} · ${formatarDinheiro(maeDaParte.valor_centavos)}` : ""} {TEXTOS_DIVISAO.filhas_seguem}
        </p>
        <Seletor
          rotulo={T.status}
          opcoes={opcoes.status}
          value={texto("status")}
          onChange={(e) => escolher("status", e.target.value)}
        />
        {faltaCentavos !== null ? <FaltaDoParcial centavos={faltaCentavos} /> : null}
      {atrasadoDesde !== null ? <AtrasoDoLancamento desde={atrasadoDesde} /> : null}
        {erros.status ? (
          <p role="alert" className="texto-label font-normal text-danger-fg">
            {erros.status}
          </p>
        ) : null}
        {aoProgramar && aoDesprogramar ? (
          <DividaDoLancamento
            linha={linha}
            pago={pagoOuQuitada}
            aoProgramar={aoProgramar}
            aoDesprogramar={aoDesprogramar}
          />
        ) : null}
      </Moldura>
    );
  }

  return (
    <Moldura
      titulo={nomeExibido(linha)}
      aoFechar={aoFechar}
      topo={
        <p role="status" className="shrink-0 texto-caption text-text-muted">
          {indicador}
        </p>
      }
      rodape={
        <div className="ml-auto flex gap-2">
          {mae ? <Botao onClick={() => void desvincular()}>{TEXTOS_AJUSTE.desvincular}</Botao> : null}
          {aoDividir && !mae ? (
            <Botao onClick={() => aoDividir(linha.id)}>{maeDividida ? TEXTOS_DIVISAO.botao_editar : TEXTOS_DIVISAO.botao}</Botao>
          ) : null}
          <Botao variante="destrutivo" onClick={() => aoExcluir(linha.id)}>
            {T.excluir}
          </Botao>
        </div>
      }
    >
      {alteradoAs ? (
        <p
          role="status"
          className="rounded-md border border-alert-warning-border bg-alert-warning-bg px-3 py-2 texto-body text-text"
        >
          {rotuloAlteradoEmOutroAparelho(formatarHora(alteradoAs))}
        </p>
      ) : null}
      {ehPrevisto(linha) ? <OrigemDoPrevisto origemId={linha.origem_lancamento_id} repo={repo} /> : null}
      <p className="texto-body text-text-muted">
        {T.nome_na_fatura} <span className="texto-body-strong text-text">{linha.nome}</span> {T.nao_editavel}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Campo
          rotulo={T.valor}
          inputMode="decimal"
          autoComplete="off"
          className="texto-number"
          value={texto("valor")}
          erro={erros.valor ?? null}
          // A mãe dividida tem o Valor travado: as filhas somam esse Valor (desfaça a divisão para corrigi-lo).
          readOnly={maeDividida}
          aria-describedby={maeDividida ? `${idSugestao}-valor` : undefined}
          onFocus={() => focar("valor")}
          onChange={(e) => definirRascunho("valor", e.target.value)}
          onBlur={() => sair("valor")}
        />
        <Campo
          rotulo={T.data}
          type="date"
          className="texto-number"
          value={texto("data")}
          erro={erros.data ?? null}
          onFocus={() => focar("data")}
          onChange={(e) => definirRascunho("data", e.target.value)}
          onBlur={(e) => {
            // Data incompleta (PC): o campo diz "" mas o que está nele não é uma data.
            if (e.currentTarget.validity.badInput) {
              focado.current = null;
              definirErro("data", mensagem("lancamento.data_invalida"));
              return;
            }
            sair("data");
          }}
        />
      </div>
      {maeDividida ? (
        <p id={`${idSugestao}-valor`} className="texto-caption text-text-muted">
          {TEXTOS_DIVISAO.dividido_somente_leitura}
        </p>
      ) : null}
      {ajustes.length > 0 ? (
        <p className="texto-label font-normal text-text-muted">
          {rotuloAjusteDaMae(somaDosAjustes(ajustes), liquidoCentavos(linha, ajustes))}
        </p>
      ) : null}
      {textoConferencia ? (
        <p role="status" className="texto-label text-text">
          {textoConferencia}
        </p>
      ) : null}
      <Campo
        rotulo={T.apelido}
        maxLength={60}
        autoComplete="off"
        value={texto("apelido")}
        erro={erros.apelido ?? null}
        onFocus={() => focar("apelido")}
        onChange={(e) => definirRascunho("apelido", e.target.value)}
        onBlur={() => sair("apelido")}
      />
      {apelidoPendente ? (
        <FaixaPergunta
          pergunta={perguntaApelidoEmMassa(
            apelidoPendente.plano.mudam,
            apelidoPendente.nome,
            apelidoPendente.plano.comOutro,
            apelidoPendente.depois,
          )}
          aoResponder={(resposta) => void responderApelido(resposta)}
        />
      ) : null}
      {mae ? (
        // O Ajuste segue a mãe: Tipo e Responsável só para leitura.
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="texto-label text-text">{T.responsavel}</span>
              <span className="flex min-h-toque items-center texto-body text-text">
                {nomeDoCadastro(cadastros.responsaveis, linha.responsavel_id, TEXTOS_PAINEL.sem_responsavel)}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="texto-label text-text">{T.tipo}</span>
              <span className="flex min-h-toque items-center texto-body text-text">
                {nomeDoCadastro(cadastros.tipos, linha.tipo_id, T.sem_tipo)}
              </span>
            </div>
          </div>
          <p className="texto-caption text-text-muted">{rotuloSegueAParcela(nomeExibido(mae))}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-2 gap-2">
            {maeDividida ? (
              // O Responsável é de cada parte: aqui só leitura.
              <div className="flex flex-col gap-1">
                <span className="texto-label text-text">{T.responsavel}</span>
                <span className="flex min-h-toque flex-col justify-center texto-body text-text">
                  <span>{TEXTOS_DIVISAO.responsavel_dividido}</span>
                  <span className="texto-caption text-text-muted">{resumoDaDivisao}</span>
                </span>
              </div>
            ) : (
              <Seletor
                rotulo={T.responsavel}
                opcoes={opcoes.responsavel}
                value={texto("responsavel")}
                onChange={(e) => escolher("responsavel", e.target.value)}
                aria-describedby={sugestao ? idSugestao : undefined}
              />
            )}
            <Seletor
              rotulo={T.tipo}
              opcoes={opcoes.tipo}
              value={texto("tipo")}
              onChange={(e) => escolher("tipo", e.target.value)}
              aria-describedby={sugestao ? idSugestao : undefined}
            />
          </div>
          {sugestao ? (
            <p id={idSugestao} className="texto-caption text-text-muted">
              {sugestao}
            </p>
          ) : null}
        </div>
      )}
      {aPerguntar.length > 0 ? (
        <FaixaPergunta
          pergunta={perguntaAplicarAosPrevistos(aPerguntar.length)}
          aoResponder={(resposta) => void responderPrevistos(resposta)}
        />
      ) : null}
      <Seletor
        rotulo={T.status}
        opcoes={opcoes.status}
        value={texto("status")}
        onChange={(e) => escolher("status", e.target.value)}
      />
      {faltaCentavos !== null ? <FaltaDoParcial centavos={faltaCentavos} /> : null}
      {atrasadoDesde !== null ? <AtrasoDoLancamento desde={atrasadoDesde} /> : null}
      {erros.status ? (
        <p role="alert" className="texto-label font-normal text-danger-fg">
          {erros.status}
        </p>
      ) : null}
      {/* A mãe dividida programa pelas partes; o Ajuste acompanha a parcela. */}
      {aoProgramar && aoDesprogramar && !maeDividida && !mae ? (
        <DividaDoLancamento
          linha={linha}
          pago={pagoOuQuitada}
          aoProgramar={aoProgramar}
          aoDesprogramar={aoDesprogramar}
        />
      ) : null}
      <Observacao
        valor={texto("observacao")}
        erro={erros.observacao}
        aoMudar={(t) => definirRascunho("observacao", t)}
        aoFocar={() => focar("observacao")}
        aoSair={() => sair("observacao")}
      />
      <p className="texto-caption text-text-muted">
        {rotuloDetalhesLancamento(
          formatarParcela(linha.parcela_n, linha.parcela_total),
          linha.final_cartao,
          ROTULOS_LANCADO_POR[linha.lancado_por],
        )}
      </p>
    </Moldura>
  );
}

// --------------------------------------------------------------- Incluir

function IncluirLancamento({
  mesAberto,
  fatura,
  cartoes,
  configsCiclo,
  statusPadraoId,
  cadastros,
  aoFechar,
  aoIncluido,
  repo: repoDado,
}: Extract<PropsPainelLancamento, { modo: "novo" }>) {
  const repo = repoDado ?? repoLancamentos();
  const toast = useToast();
  const padrao = cadastros.status.some((s) => s.id === statusPadraoId && !s.arquivado) ? statusPadraoId! : "";
  const [form, setForm] = useState<FormNovoLancamento>({ ...FORM_NOVO_VAZIO, status: padrao });
  const [erros, setErros] = useState<Partial<Record<CampoNovo, string>>>({});
  const [gravando, setGravando] = useState(false);
  const montado = useRef(false);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const mudar = <K extends keyof FormNovoLancamento>(campo: K, valor: FormNovoLancamento[K]) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (campo in erros) setErros((e) => ({ ...e, [campo]: undefined }));
  };
  const erro = (campo: CampoNovo) => (erros[campo] ? mensagem(erros[campo]) : null);
  const opcoes = opcoesDosCadastros(cadastros, { responsavel: null, tipo: null, status: null });

  async function incluir() {
    const r = novoLancamento(form, { mesAberto, fatura, cartoes, configsCiclo });
    if (!r.ok) {
      setErros(r.erros);
      return;
    }
    setGravando(true);
    const gravado = await repo.incluir(r.valor);
    setGravando(false);
    if (!gravado.ok) {
      toast.mostrar({ texto: mensagem(gravado.codigo) });
      return;
    }
    // O painel fechou (ou o Mês mudou) enquanto gravava: só avisa.
    if (!montado.current) {
      toast.mostrar({ texto: rotuloIncluidoEm(gravado.linha.mes) });
      return;
    }
    aoIncluido(gravado.linha);
  }

  const texto = (campo: "nome" | "valor" | "data" | "apelido") => ({
    value: form[campo],
    erro: erro(campo),
    onChange: (e: { target: { value: string } }) => mudar(campo, e.target.value),
  });

  return (
    <Moldura
      titulo={T.titulo_novo}
      aoFechar={aoFechar}
      rodape={
        <div className="ml-auto flex gap-2">
          <Botao onClick={aoFechar}>{ROTULOS.cancelar}</Botao>
          <Botao variante="primario" disabled={gravando} onClick={() => void incluir()}>
            {T.incluir}
          </Botao>
        </div>
      }
    >
      <Campo rotulo={T.nome} maxLength={200} autoComplete="off" {...texto("nome")} />
      <div className="grid grid-cols-2 gap-2">
        <Campo rotulo={T.valor} inputMode="decimal" autoComplete="off" className="texto-number" {...texto("valor")} />
        <Campo rotulo={T.data} type="date" className="texto-number" {...texto("data")} />
      </div>
      <Campo rotulo={T.apelido} maxLength={60} autoComplete="off" {...texto("apelido")} />
      <div className="grid grid-cols-2 gap-2">
        <Seletor
          rotulo={T.responsavel}
          opcoes={opcoes.responsavel}
          value={form.responsavel}
          onChange={(e) => mudar("responsavel", e.target.value)}
        />
        <Seletor rotulo={T.tipo} opcoes={opcoes.tipo} value={form.tipo} onChange={(e) => mudar("tipo", e.target.value)} />
      </div>
      <Seletor rotulo={T.status} opcoes={opcoes.status} value={form.status} onChange={(e) => mudar("status", e.target.value)} />
      <Observacao valor={form.observacao} erro={erro("observacao")} aoMudar={(t) => mudar("observacao", t)} />
      {fatura ? (
        <label className="flex min-h-toque cursor-pointer items-center gap-3 texto-body">
          <input
            type="checkbox"
            checked={form.corrigeFatura}
            onChange={(e) => mudar("corrigeFatura", e.target.checked)}
            className="size-4.5 shrink-0 cursor-pointer accent-accent"
          />
          {T.corrige_fatura}
        </label>
      ) : null}
      {fatura && form.corrigeFatura ? (
        <div className="flex flex-col gap-1">
          <Seletor
            rotulo={T.cartao}
            opcoes={[{ valor: "", rotulo: T.escolha_cartao }, ...cartoes.map((f) => ({ valor: f, rotulo: rotuloCartaoFinal(f) }))]}
            value={form.cartao}
            aria-invalid={erros.cartao ? true : undefined}
            aria-describedby={erros.cartao ? "erro-cartao-novo" : undefined}
            className={cn(erros.cartao && "border-danger-fg")}
            onChange={(e) => mudar("cartao", e.target.value)}
          />
          {erros.cartao ? (
            <p id="erro-cartao-novo" className="texto-label font-normal text-danger-fg">
              {erro("cartao")}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="texto-caption text-text-muted">{rotuloDetalhesLancamento("", null, ROTULOS_LANCADO_POR.manual)}</p>
    </Moldura>
  );
}
