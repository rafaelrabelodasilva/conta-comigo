"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { liquidoCentavos, somaDosAjustes } from "@/domain/ajustes";
import type { ConfigCiclo } from "@/domain/ciclo";
import type { Conferencia } from "@/domain/conferencia";
import { formatarHora, instanteEmMicros } from "@/domain/datas";
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
  TEXTOS_AJUSTE,
  TEXTOS_LANCAMENTO as T,
  TEXTOS_PAINEL,
  mensagem,
  rotuloAjusteDaMae,
  rotuloAlteradoEmOutroAparelho,
  rotuloCartaoFinal,
  rotuloDetalhesLancamento,
  rotuloIncluidoEm,
  rotuloSalvoAs,
  rotuloSegueAParcela,
} from "@/domain/mensagens";
import { nomeExibido } from "@/domain/painel";
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
import { Seletor, type OpcaoSeletor } from "@/ui/Seletor";
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

/** Atrasos das novas tentativas automáticas, em ms. */
export const ATRASOS_NOVA_TENTATIVA = [2000, 5000, 10000] as const;

type Cadastro<T extends "responsaveis" | "tipos" | "status"> = LinhaDe<T>;

export type CadastrosPainel = {
  responsaveis: readonly Cadastro<"responsaveis">[];
  tipos: readonly Cadastro<"tipos">[];
  status: readonly Cadastro<"status">[];
};

type Comum = {
  cadastros: CadastrosPainel;
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

function EditarLancamento({
  linha,
  mae = null,
  ajustes = SEM_AJUSTES,
  lerLinha,
  conferencia,
  cadastros,
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

  // Refs para as gravações assíncronas lerem o estado atual.
  const rascunhosRef = useRef(rascunhos);
  const linhaRef = useRef(linha);
  const ajustesRef = useRef(ajustes);
  const maeRef = useRef(mae);
  const focado = useRef<CampoLancamento | null>(null);
  const emVoo = useRef(0);
  const visto = useRef(linha.updated_at);
  const gravadosAqui = useRef<string[]>([]);
  const temporizadores = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    linhaRef.current = linha;
    ajustesRef.current = ajustes;
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
    // Tipo e Responsável da mãe vão também para os Ajustes dela, na mesma requisição.
    const junto = SEGUEM_A_MAE.includes(campo) ? ajustesRef.current.map((a) => a.id) : [];
    const r =
      junto.length > 0
        ? await repo.atualizar(linhaRef.current.id, mudancaDaColuna(mudanca), { junto })
        : await repo.atualizar(linhaRef.current.id, mudancaDaColuna(mudanca));
    emVoo.current--;
    if (r.ok) {
      gravadosAqui.current.push(r.linha.updated_at);
      setSalvoAs(formatarHora(r.linha.updated_at));
      definirEstado(campo, undefined);
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
  const nomeDoCadastro = (lista: readonly { id: string; nome: string }[], id: string | null, sem: string) =>
    id === null ? sem : (lista.find((c) => c.id === id)?.nome ?? sem);

  const situacao = Object.values(estados);
  let indicador: ReactNode = null;
  if (situacao.includes("salvando")) indicador = T.salvando;
  else if (situacao.includes("tentando")) indicador = T.tentando;
  else if (falhou) indicador = <span className="text-danger-fg">{mensagem("salvar.falhou")}</span>;
  else if (salvoAs) indicador = rotuloSalvoAs(salvoAs);

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
        <div className="grid grid-cols-2 gap-2">
          <Seletor
            rotulo={T.responsavel}
            opcoes={opcoes.responsavel}
            value={texto("responsavel")}
            onChange={(e) => escolher("responsavel", e.target.value)}
          />
          <Seletor
            rotulo={T.tipo}
            opcoes={opcoes.tipo}
            value={texto("tipo")}
            onChange={(e) => escolher("tipo", e.target.value)}
          />
        </div>
      )}
      <Seletor
        rotulo={T.status}
        opcoes={opcoes.status}
        value={texto("status")}
        onChange={(e) => escolher("status", e.target.value)}
      />
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
