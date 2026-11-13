"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  cadastrosComOsNovos,
  lerAba,
  planejarAbas,
  planejarCadastros,
  regrasIniciais,
  resolverCadastros,
  type AbaDaPlanilha,
  type AbaLida,
  type CadastrosDoApp,
  type ErroDeAba,
  type EstadoDoApp,
  type PlanoDaAba,
  type PlanoDeCadastros,
} from "@/domain/importacao-planilha";
import {
  ROTULOS,
  TEXTOS_PLANILHA as T,
  erroDaAba,
  mensagem,
  resumoDaImportacao,
  rotuloApagarHistorico,
  rotuloPreviaDaAba,
  tituloApagarHistorico,
} from "@/domain/mensagens";
import { formatarMes } from "@/domain/datas";
import type { Responsavel } from "@/domain/responsaveis";
import { repoPlanilha } from "@/data/planilha-repo";
import { repoRegras } from "@/data/regras-repo";
import { repoResponsaveis } from "@/data/responsaveis-repo";
import { repoStatus } from "@/data/status-repo";
import { repoTipos } from "@/data/tipos-repo";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { ConfirmarAcao } from "@/ui/ConfirmarAcao";
import { useToast } from "@/ui/Toast";
import { cabemOsResponsaveis, criarCadastrosDaPlanilha } from "./criar-cadastros";
import { executarImportacao, type ProgressoDaAba, type ResultadoDaImportacao } from "./executar-importacao";
import { lerXlsx, type PlanilhaLida } from "./ler-xlsx";
import { useAvisarRascunho, type PropsSecao } from "./rascunho";

// Configurações → Importar planilha (História 3.10, FR-2, UX-DR25). Fluxo:
// escolher o `.xlsx` (lido neste aparelho, sem Google) → abas (01/2026 a
// 10/2026 marcadas) → prévia do que vai acontecer, sem gravar → importar com
// progresso por aba → resumo que leva às Regras "criadas agora". Uma aba com
// erro mostra "Não foi possível ler a aba 03/2026" e as outras seguem. Lê e
// grava só por `repoPlanilha`/`repoRegras` e pelos repositórios de cadastros;
// tudo o que se decide é do núcleo (`domain/importacao-planilha`).
// "Apagar histórico importado" é o caminho de volta, por Mês.

type Fase = "inicio" | "lendo" | "abas" | "previa" | "importando" | "concluida";

type Previa = {
  planos: PlanoDaAba[];
  cadastros: PlanoDeCadastros;
  regras: number;
  lidas: AbaLida[];
  /** Abas que não puderam ser lidas, com o motivo. */
  erros: { nome: string; codigo: string; linha?: number }[];
  semCor: boolean;
};

function portasDeCadastro() {
  return {
    responsaveis: repoResponsaveis(),
    tipos: repoTipos(),
    status: repoStatus(),
    ler: async () => {
      const r = await repoPlanilha().lerCadastros();
      return r.ok ? { ok: true as const, responsaveis: r.responsaveis, status: r.cadastros.status } : { ok: false as const };
    },
  };
}

export function SecaoImportarPlanilha({ aoMudarRascunho }: PropsSecao = {}) {
  const toast = useToast();
  const entrada = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<Fase>("inicio");
  const [planilha, setPlanilha] = useState<PlanilhaLida | null>(null);
  const [estado, setEstado] = useState<EstadoDoApp | null>(null);
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [progresso, setProgresso] = useState<ProgressoDaAba[]>([]);
  const [resultado, setResultado] = useState<ResultadoDaImportacao | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const emCurso = useRef(false);

  useAvisarRascunho(fase !== "inicio" && fase !== "concluida", aoMudarRascunho);

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErroGeral(null);
    setFase("lendo");
    const [lida, lidoEstado] = await Promise.all([lerXlsx(arquivo), repoPlanilha().lerEstado()]);
    if (!lida.ok) {
      setErroGeral(mensagem(lida.erro.codigo));
      setFase("inicio");
      return;
    }
    if (!lidoEstado.ok) {
      setErroGeral(mensagem("carregar.falhou"));
      setFase("inicio");
      return;
    }
    setPlanilha(lida.valor);
    setEstado(lidoEstado.estado);
    setMarcadas(new Set(lida.valor.abas.filter((a) => a.marcada).map((a) => a.mes)));
    setPrevia(null);
    setFase("abas");
  }

  function alternar(mes: string) {
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(mes)) novo.delete(mes);
      else novo.add(mes);
      return novo;
    });
  }

  async function verPrevia() {
    if (!planilha || !estado) return;
    setErroGeral(null);
    const escolhidas = planilha.abas.filter((a) => marcadas.has(a.mes));
    const lidas: AbaLida[] = [];
    const erros: Previa["erros"] = [];
    for (const aba of escolhidas) {
      const r = lerAba(planilha.celulas.get(aba.nome) ?? []);
      if (r.ok) lidas.push({ nome: aba.nome, mes: aba.mes, linhas: r.valor });
      else erros.push({ nome: aba.nome, codigo: r.erro.codigo, linha: (r.erros as ErroDeAba[])[0]?.linha });
    }
    const atuais = await repoPlanilha().lerCadastros();
    if (!atuais.ok) {
      setErroGeral(mensagem("carregar.falhou"));
      return;
    }
    const linhas = lidas.flatMap((a) => a.linhas);
    const cadastros = planejarCadastros(linhas, atuais.cadastros);
    const comNovos: CadastrosDoApp = cadastrosComOsNovos(atuais.cadastros, cadastros);
    const resolver = resolverCadastros(comNovos);
    // Só conta as Regras que ainda não existem: a chave que já tem Regra não é tocada.
    const existentes = await repoRegras().listar();
    const jaTem = new Set(existentes.ok ? existentes.regras.map((r) => r.chave) : []);
    setPrevia({
      planos: planejarAbas(lidas, resolver, estado),
      cadastros,
      regras: regrasIniciais(lidas, resolver, "").filter((r) => !jaTem.has(r.chave)).length,
      lidas,
      erros,
      semCor: !cabemOsResponsaveis(atuais.responsaveis as Responsavel[], cadastros.criar.responsaveis.length),
    });
    setFase("previa");
  }

  async function importar() {
    if (!previa || emCurso.current) return;
    emCurso.current = true;
    setErroGeral(null);
    setFase("importando");
    const r = await executarImportacao(
      {
        lerEstado: () => repoPlanilha().lerEstado(),
        lerCadastros: () => repoPlanilha().lerCadastros(),
        criarCadastros: (plano) => criarCadastrosDaPlanilha(plano, portasDeCadastro()),
        importarAba: (plano) => repoPlanilha().importarAba(plano),
        criarRegras: (regras) => repoRegras().criarIniciais(regras),
        agora: () => new Date(),
      },
      previa.lidas,
      setProgresso,
    );
    emCurso.current = false;
    if (!r.ok) {
      setErroGeral(mensagem(r.erro.codigo));
      setFase("previa");
      return;
    }
    setResultado(r.valor);
    setFase("concluida");
  }

  function recomecar() {
    setFase("inicio");
    setPlanilha(null);
    setPrevia(null);
    setResultado(null);
    setProgresso([]);
    setErroGeral(null);
    if (entrada.current) entrada.current.value = "";
  }

  return (
    <section
      aria-labelledby="titulo-planilha"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-3"
    >
      <header className="flex flex-col gap-1">
        <h2 id="titulo-planilha" className="texto-body-strong">
          {ROTULOS.importar_planilha}
        </h2>
        <p className="texto-body text-text-muted">{T.descricao}</p>
      </header>

      <input
        ref={entrada}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        tabIndex={-1}
        aria-label={T.escolher}
        onChange={(e) => void escolher(e.target.files?.[0])}
      />

      {erroGeral ? (
        <p role="alert" className="texto-body text-danger-fg">
          {erroGeral}
        </p>
      ) : null}

      {fase === "inicio" || fase === "lendo" ? (
        <div className="flex items-center gap-3">
          <Botao variante="primario" disabled={fase === "lendo"} onClick={() => entrada.current?.click()}>
            {T.escolher}
          </Botao>
          {fase === "lendo" ? (
            <span role="status" className="texto-body text-text-muted">
              {T.lendo}
            </span>
          ) : null}
        </div>
      ) : null}

      {fase === "abas" && planilha ? (
        <ListaDeAbas
          abas={planilha.abas}
          marcadas={marcadas}
          estado={estado}
          aoAlternar={alternar}
          aoVerPrevia={() => void verPrevia()}
          aoTrocar={() => {
            recomecar();
            entrada.current?.click();
          }}
        />
      ) : null}

      {fase === "previa" && previa ? (
        <PreviaDaImportacao
          previa={previa}
          aoVoltar={() => setFase("abas")}
          aoImportar={() => void importar()}
        />
      ) : null}

      {fase === "importando" ? <ProgressoPorAba progresso={progresso} /> : null}

      {fase === "concluida" && resultado ? (
        <ResumoFinal resultado={resultado} progresso={progresso} aoRecomecar={recomecar} />
      ) : null}

      <ApagarHistorico recarregarQuando={fase === "concluida"} aoApagar={(msg) => toast.mostrar({ texto: msg })} />
    </section>
  );
}

function ListaDeAbas(props: {
  abas: readonly AbaDaPlanilha[];
  marcadas: ReadonlySet<string>;
  estado: EstadoDoApp | null;
  aoAlternar: (mes: string) => void;
  aoVerPrevia: () => void;
  aoTrocar: () => void;
}) {
  const { abas, marcadas, estado } = props;
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-1">
        <legend className="texto-label text-text-muted">{T.marcar_abas}</legend>
        <ul className="grid grid-cols-2 gap-x-4">
          {abas.map((a) => {
            const comFatura = estado?.mesesComFatura.includes(a.mes) ?? false;
            const jaImportada = estado?.mesesComHistorico.includes(a.mes) ?? false;
            return (
              <li key={a.mes}>
                <label className="flex min-h-toque cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-[var(--accent)]"
                    checked={marcadas.has(a.mes)}
                    onChange={() => props.aoAlternar(a.mes)}
                  />
                  <span className="min-w-0 texto-body">
                    <span className="texto-body-strong">{a.nome}</span>
                    {comFatura ? <span className="block texto-label font-normal text-text-muted">{T.aba_com_fatura}</span> : null}
                    {!comFatura && jaImportada ? (
                      <span className="block texto-label font-normal text-text-muted">{T.aba_ja_importada}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      {marcadas.size === 0 ? <p className="texto-body text-text-muted">{T.nada_marcado}</p> : null}
      <div className="flex items-center gap-3">
        <Botao variante="secundario" onClick={props.aoTrocar}>
          {T.trocar}
        </Botao>
        <span className="flex-1" />
        <Botao variante="primario" disabled={marcadas.size === 0} onClick={props.aoVerPrevia}>
          {T.previa}
        </Botao>
      </div>
    </div>
  );
}

function PreviaDaImportacao({ previa, aoVoltar, aoImportar }: { previa: Previa; aoVoltar: () => void; aoImportar: () => void }) {
  const { cadastros } = previa;
  const faltam = [
    cadastros.criar.responsaveis.length > 0 ? `${ROTULOS.responsaveis}: ${cadastros.criar.responsaveis.join(", ")}` : null,
    cadastros.criar.tipos.length > 0 ? `${ROTULOS.tipos}: ${cadastros.criar.tipos.join(", ")}` : null,
    cadastros.criar.status.length > 0 ? `${ROTULOS.status}: ${cadastros.criar.status.map((s) => s.nome).join(", ")}` : null,
  ].filter((t) => t !== null);
  const semNada = previa.planos.length === 0;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="texto-body-strong">{T.previa_titulo}</h3>
      <ul className="flex flex-col gap-2">
        {previa.erros.map((e) => (
          <li key={e.nome} role="alert" className="texto-body text-danger-fg">
            <span className="texto-body-strong">{erroDaAba(e.nome)}</span>
            <span className="block texto-label font-normal">
              {mensagem(e.codigo)}
              {e.linha ? ` (linha ${e.linha})` : ""}
            </span>
          </li>
        ))}
        {previa.planos.map((p) => (
          <li key={p.mes} className="texto-body">
            <span className="texto-body-strong">{p.nome}</span>{" "}
            <span className="text-text-muted">
              {p.soRegras ? T.aba_com_fatura : rotuloPreviaDaAba(p.resumo)}
              {p.substitui ? ` · ${T.aba_ja_importada}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="texto-body">
        <span className="texto-body-strong">{T.novos_cadastros}: </span>
        {faltam.length === 0 ? T.nenhum_cadastro : faltam.join(" · ")}
      </p>
      <p className="texto-body">
        <span className="texto-body-strong">{T.regras_previstas}: </span>
        {previa.regras}
      </p>
      {previa.semCor ? (
        <p role="alert" className="texto-body text-danger-fg">
          {mensagem("responsavel.sem_cor_livre")}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Botao variante="secundario" onClick={aoVoltar}>
          {T.voltar}
        </Botao>
        <span className="flex-1" />
        <Botao variante="primario" disabled={previa.semCor || semNada} onClick={aoImportar}>
          {T.importar}
        </Botao>
      </div>
    </div>
  );
}

const LARGURA: Record<ProgressoDaAba["estado"], number> = { esperando: 0, gravando: 50, gravada: 100, so_regras: 100, erro: 100 };

function ProgressoPorAba({ progresso }: { progresso: readonly ProgressoDaAba[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="texto-body-strong" role="status">
        {T.importando}
      </h3>
      <ul className="flex flex-col gap-2">
        {progresso.map((p) => (
          <li key={p.mes} className="flex items-center gap-3 texto-body">
            <span className="w-20 shrink-0 texto-body-strong">{p.nome}</span>
            <div
              role="progressbar"
              aria-label={p.nome}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={LARGURA[p.estado]}
              className="h-2 flex-1 overflow-hidden rounded-full bg-border"
            >
              <div
                className={cn("h-full", p.estado === "erro" ? "bg-danger-fg" : "bg-accent")}
                style={{ width: `${LARGURA[p.estado]}%` }}
              />
            </div>
            <span className="w-24 shrink-0 texto-label font-normal text-text-muted">{rotuloDoEstado(p)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function rotuloDoEstado(p: ProgressoDaAba): string {
  if (p.estado === "esperando") return T.esperando;
  if (p.estado === "gravando") return T.gravando;
  if (p.estado === "so_regras") return T.so_regras;
  if (p.estado === "erro") return erroDaAba(p.nome);
  return T.gravada;
}

function ResumoFinal({
  resultado,
  progresso,
  aoRecomecar,
}: {
  resultado: ResultadoDaImportacao;
  progresso: readonly ProgressoDaAba[];
  aoRecomecar: () => void;
}) {
  const { resumo } = resultado;
  const aVer = resultado.regrasDesde
    ? `/configuracoes?secao=regras&criadas_desde=${encodeURIComponent(resultado.regrasDesde)}`
    : "/configuracoes?secao=regras";
  return (
    <div className="flex flex-col gap-3">
      <h3 className="texto-body-strong" role="status">
        {T.resumo_titulo}
      </h3>
      <p className="texto-body">{resumoDaImportacao(resumo)}</p>
      {resultado.erros.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {resultado.erros.map((e) => (
            <li key={e.nome} role="alert" className="texto-body text-danger-fg">
              <span className="texto-body-strong">{e.nome === "Regras" ? mensagem(e.codigo) : erroDaAba(e.nome)}</span>
              {e.nome === "Regras" ? null : <span className="block texto-label font-normal">{mensagem(e.codigo)}</span>}
            </li>
          ))}
        </ul>
      ) : null}
      <ProgressoPorAba progresso={progresso} />
      <div className="flex flex-wrap items-center gap-3">
        <Botao variante="secundario" onClick={aoRecomecar}>
          {T.trocar}
        </Botao>
        <span className="flex-1" />
        <Botao asChild variante="secundario">
          <Link href="/">{T.ver_painel}</Link>
        </Botao>
        <Botao asChild variante="primario">
          <Link href={aVer}>{T.ver_regras}</Link>
        </Botao>
      </div>
    </div>
  );
}

function ApagarHistorico({ recarregarQuando, aoApagar }: { recarregarQuando: boolean; aoApagar: (texto: string) => void }) {
  const [meses, setMeses] = useState<{ mes: string; quantidade: number }[] | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Muda a cada gravação (importar ou apagar) para reler a lista do banco.
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let vivo = true;
    void repoPlanilha()
      .mesesComHistorico()
      .then((r) => {
        if (vivo) setMeses(r.ok ? r.meses : []);
      });
    return () => {
      vivo = false;
    };
  }, [recarregarQuando, versao]);

  async function apagar(mes: string) {
    setApagando(null);
    setOcupado(true);
    const r = await repoPlanilha().apagarHistorico(mes);
    setOcupado(false);
    aoApagar(r.ok ? T.apagado : mensagem(r.codigo));
    setVersao((v) => v + 1);
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <h3 className="texto-body-strong">{T.historico_titulo}</h3>
      <p className="texto-label font-normal text-text-muted">{T.historico_ajuda}</p>
      {meses === null ? null : meses.length === 0 ? (
        <p className="texto-body text-text-muted">{T.historico_vazio}</p>
      ) : (
        <ul className="flex flex-col">
          {meses.map((m) => (
            <li key={m.mes} className="flex min-h-toque items-center gap-3">
              <span className="min-w-0 flex-1 texto-body">{rotuloApagarHistorico(m.mes, m.quantidade)}</span>
              <Botao variante="destrutivo" tamanho="compacto" disabled={ocupado} onClick={() => setApagando(m.mes)}>
                {T.apagar}
              </Botao>
            </li>
          ))}
        </ul>
      )}
      <ConfirmarAcao
        aberta={apagando !== null}
        aoMudar={(aberta) => {
          if (!aberta) setApagando(null);
        }}
        titulo={apagando ? tituloApagarHistorico(apagando) : T.confirmar_apagar}
        descricao={apagando ? `${formatarMes(apagando)}. ${T.historico_ajuda}` : ""}
        rotuloConfirmar={T.confirmar_apagar}
        aoConfirmar={() => apagando && void apagar(apagando)}
      />
    </div>
  );
}
