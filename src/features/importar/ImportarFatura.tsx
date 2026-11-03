"use client";

import { useRef, useState, type ReactNode } from "react";
import { removerDadosPessoais } from "@/domain/dados-pessoais";
import {
  conferirImportacao,
  pareceFaturaSantander,
  prepararImportacao,
  type ConferenciaImportacao,
  type Importacao,
} from "@/domain/importacao-fatura";
import {
  ETAPAS_IMPORTACAO,
  ROTULOS,
  TEXTOS_IMPORTAR as T,
  mensagem,
  rotuloConferencia,
  rotuloDespesasCreditos,
  rotuloPassoImportar,
  rotuloSeraoGravados,
  textoExtracaoIncompleta,
  tituloFaturaLida,
  type EtapaImportacao,
} from "@/domain/mensagens";
import type { Resultado } from "@/domain/resultado";
import { repoFaturas } from "@/data/faturas-repo";
import { useLinhas } from "@/data/realtime";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { Janela } from "@/ui/Janela";
import { CANCELADO, extrairTexto } from "./extrair";
import { lerPdf, type PdfLido } from "./ler-pdf";

// Janela "Importar fatura" (UX-DR20, História 2.3), em 3 passos: PDF, senha
// e conferir. O PDF e a senha ficam no aparelho (pdf.js); só o texto sem
// dados pessoais vai para a leitura. O núcleo prepara as linhas e a
// Conferência, e o repositório grava tudo ou nada pela RPC. "Cancelar"
// interrompe sem gravar, mas fica desligado enquanto a RPC grava.

const ORDEM_ETAPAS = Object.keys(ETAPAS_IMPORTACAO) as EtapaImportacao[];

type Passo = 1 | 2 | 3;

type Estado =
  | { tipo: "arquivo"; erro: string | null; naoSantander: boolean }
  | { tipo: "senha"; erro: string | null }
  | { tipo: "processando"; passo: Passo; etapa: EtapaImportacao }
  | { tipo: "falha_leitura"; codigo: string }
  | {
      tipo: "conferir";
      importacao: Importacao;
      conferencia: ConferenciaImportacao;
      gravando: boolean;
      erro: string | null;
    };

const INICIAL: Estado = { tipo: "arquivo", erro: null, naoSantander: false };

/** Dá a vez ao navegador para a etapa nova aparecer na barra de progresso. */
function deixarDesenhar(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function passoDo(estado: Estado): Passo {
  if (estado.tipo === "arquivo") return 1;
  if (estado.tipo === "senha") return 2;
  if (estado.tipo === "processando") return estado.passo;
  return 3;
}

export type PropsImportarFatura = {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
};

export function ImportarFatura({ aberta, aoMudar }: PropsImportarFatura) {
  const [estado, setEstado] = useState<Estado>(INICIAL);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const { linhas: faturas } = useLinhas("faturas");
  // O texto já limpo: "Tentar de novo" reenvia o mesmo, sem pedir PDF e senha.
  const textoLimpo = useRef<string | null>(null);
  const controle = useRef<AbortController | null>(null);
  // Cada tentativa tem um número; o resultado de uma cancelada é ignorado.
  const geracao = useRef(0);
  // Trava contra dois toques rápidos em Importar (o estado ainda é o antigo).
  const gravandoAgora = useRef(false);

  const gravando = estado.tipo === "conferir" && estado.gravando;

  function reiniciar() {
    controle.current?.abort();
    controle.current = null;
    geracao.current++;
    textoLimpo.current = null;
    setEstado(INICIAL);
    setArquivo(null);
    setSenha("");
  }

  function fechar() {
    if (gravando) return;
    reiniciar();
    aoMudar(false);
  }

  async function lerTexto(texto: string, minha: number) {
    setEstado({ tipo: "processando", passo: 3, etapa: "lendo" });
    const c = new AbortController();
    controle.current = c;
    const lida = await extrairTexto(texto, c.signal);
    if (minha !== geracao.current) return;
    controle.current = null;
    if (!lida.ok) {
      if (lida.erro.codigo !== CANCELADO) setEstado({ tipo: "falha_leitura", codigo: lida.erro.codigo });
      return;
    }

    setEstado({ tipo: "processando", passo: 3, etapa: "conferindo" });
    await deixarDesenhar();
    if (minha !== geracao.current) return;
    const importacao = prepararImportacao(lida.valor);
    if (!importacao.ok) {
      setEstado({ tipo: "falha_leitura", codigo: importacao.erro.codigo });
      return;
    }
    // Sem nenhum Lançamento, gravar só bloquearia o Mês: é leitura que falhou.
    if (importacao.valor.lancamentos.length === 0) {
      setEstado({ tipo: "falha_leitura", codigo: "fatura.leitura_falhou" });
      return;
    }
    const conferencia = conferirImportacao(lida.valor);
    // A classificação (Regras, sugestões) chega no Épico 3: a etapa só aparece.
    setEstado({ tipo: "processando", passo: 3, etapa: "classificando" });
    await deixarDesenhar();
    if (minha !== geracao.current) return;
    setEstado({ tipo: "conferir", importacao: importacao.valor, conferencia, gravando: false, erro: null });
  }

  /** Abre o PDF (sem senha no passo 1) e segue para a leitura. */
  async function abrir(passo: 1 | 2, senhaUsada: string) {
    if (!arquivo) {
      setEstado({ tipo: "arquivo", erro: mensagem("fatura.sem_arquivo"), naoSantander: false });
      return;
    }
    const minha = ++geracao.current;
    setEstado({ tipo: "processando", passo, etapa: "abrindo" });
    let lido: Resultado<PdfLido>;
    try {
      // Um buffer novo a cada tentativa: o pdf.js consome o que recebe.
      lido = await lerPdf(new Uint8Array(await arquivo.arrayBuffer()), senhaUsada);
    } catch {
      lido = { ok: false, erro: { codigo: "fatura.pdf_invalido" } };
    }
    if (minha !== geracao.current) return;
    if (!lido.ok) {
      const codigo = lido.erro.codigo;
      if (codigo === "fatura.senha_vazia" || codigo === "fatura.senha_incorreta") {
        // No passo 1, pedir a senha não é erro: só vai para o passo 2.
        setEstado({ tipo: "senha", erro: passo === 1 ? null : mensagem(codigo) });
      } else {
        setEstado({ tipo: "arquivo", erro: mensagem(codigo), naoSantander: false });
      }
      return;
    }
    const texto = removerDadosPessoais(lido.valor.texto);
    if (!pareceFaturaSantander(texto)) {
      setEstado({ tipo: "arquivo", erro: null, naoSantander: true });
      return;
    }
    textoLimpo.current = texto;
    await lerTexto(texto, minha);
  }

  function tentarLerDeNovo() {
    const texto = textoLimpo.current;
    if (!texto) {
      reiniciar();
      return;
    }
    void lerTexto(texto, ++geracao.current);
  }

  async function gravar() {
    if (estado.tipo !== "conferir" || estado.gravando || gravandoAgora.current) return;
    gravandoAgora.current = true;
    const atual = estado;
    setEstado({ ...atual, gravando: true, erro: null });
    const r = await repoFaturas().importar(atual.importacao);
    gravandoAgora.current = false;
    if (r.ok) {
      reiniciar();
      aoMudar(false);
      return;
    }
    setEstado({ ...atual, gravando: false, erro: r.codigo });
  }

  const passo = passoDo(estado);
  const ocupado = estado.tipo === "processando";

  const cancelar = (
    <Botao onClick={fechar} disabled={gravando}>
      {ROTULOS.cancelar}
    </Botao>
  );

  let corpo: ReactNode = null;
  let acoes: ReactNode = cancelar;

  if (estado.tipo === "arquivo" && estado.naoSantander) {
    corpo = (
      <p role="alert" className="rounded-lg border border-alert-warning-border bg-alert-warning-bg p-3 texto-body">
        {mensagem("fatura.nao_santander")}
      </p>
    );
    acoes = (
      <>
        {cancelar}
        <Botao variante="primario" onClick={reiniciar}>
          {T.escolher_outro_pdf}
        </Botao>
      </>
    );
  } else if (estado.tipo === "arquivo") {
    corpo = (
      <Campo
        rotulo={T.arquivo}
        type="file"
        accept="application/pdf,.pdf"
        erro={estado.erro}
        className="py-2"
        onChange={(e) => {
          // Cancelar o seletor não descarta o PDF já escolhido.
          const escolhido = e.target.files?.[0];
          if (!escolhido) return;
          setArquivo(escolhido);
          setSenha("");
          setEstado(INICIAL);
        }}
      />
    );
    acoes = (
      <>
        {cancelar}
        <Botao variante="primario" disabled={!arquivo} onClick={() => void abrir(1, "")}>
          {T.continuar}
        </Botao>
      </>
    );
  } else if (estado.tipo === "senha") {
    corpo = (
      <form
        id="form-senha-fatura"
        onSubmit={(e) => {
          e.preventDefault();
          if (!senha) {
            setEstado({ tipo: "senha", erro: mensagem("fatura.senha_vazia") });
            return;
          }
          void abrir(2, senha);
        }}
      >
        <Campo
          rotulo={T.senha}
          type="password"
          autoComplete="off"
          autoFocus
          value={senha}
          erro={estado.erro}
          onChange={(e) => {
            setSenha(e.target.value);
            if (estado.erro) setEstado({ tipo: "senha", erro: null });
          }}
        />
      </form>
    );
    acoes = (
      <>
        {cancelar}
        <Botao type="submit" form="form-senha-fatura" variante="primario">
          {T.continuar}
        </Botao>
      </>
    );
  } else if (estado.tipo === "processando") {
    const indice = ORDEM_ETAPAS.indexOf(estado.etapa);
    corpo = (
      <div className="flex flex-col gap-2">
        <div
          role="progressbar"
          aria-label={T.progresso}
          aria-valuemin={0}
          aria-valuemax={ORDEM_ETAPAS.length}
          aria-valuenow={indice + 1}
          aria-valuetext={ETAPAS_IMPORTACAO[estado.etapa]}
          className="h-1 w-full overflow-hidden rounded-full bg-border"
        >
          <div
            className="h-full bg-accent-line motion-safe:transition-[width]"
            style={{ width: `${((indice + 1) / ORDEM_ETAPAS.length) * 100}%` }}
          />
        </div>
        <p role="status" className="texto-body text-text-muted">
          {ETAPAS_IMPORTACAO[estado.etapa]}
        </p>
      </div>
    );
  } else if (estado.tipo === "falha_leitura") {
    corpo = (
      <p role="alert" className="texto-body text-danger-fg">
        {mensagem(estado.codigo)}
      </p>
    );
    acoes =
      estado.codigo === "auth.sessao_expirou" ? (
        cancelar
      ) : (
        <>
          {cancelar}
          <Botao variante="primario" onClick={tentarLerDeNovo}>
            {ROTULOS.tentar_de_novo}
          </Botao>
        </>
      );
  } else {
    const { importacao, conferencia, erro } = estado;
    const jaImportado = erro === "fatura.mes_ja_importado" || faturas.some((f) => f.mes === importacao.fatura.mes);
    const f = importacao.fatura;
    corpo = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-background p-3">
          <p className="texto-label text-text-muted">{T.lido_no_pdf}</p>
          <p className="texto-body-strong">{tituloFaturaLida(f.mes, f.vencimento)}</p>
          <p className="texto-number text-text-muted">
            {rotuloDespesasCreditos(f.total_despesas_centavos, f.total_creditos_centavos)}
          </p>
        </div>
        <p className={conferencia.conferido ? "texto-body-strong text-accent" : "texto-body-strong"}>
          {rotuloConferencia(conferencia)}
        </p>
        {conferencia.conferido ? null : (
          <p className="texto-number text-text-muted">
            {rotuloDespesasCreditos(conferencia.despesasCentavos, conferencia.creditosCentavos)}
          </p>
        )}
        <p className="texto-body">{rotuloSeraoGravados(importacao.lancamentos.length)}</p>
        {jaImportado ? (
          <p role="alert" className="rounded-lg border border-alert-warning-border bg-alert-warning-bg p-3 texto-body">
            {mensagem("fatura.mes_ja_importado")}
          </p>
        ) : conferencia.incompleta ? (
          <p role="alert" className="rounded-lg border border-alert-warning-border bg-alert-warning-bg p-3 texto-body">
            {textoExtracaoIncompleta(conferencia.quantidade)}
          </p>
        ) : null}
        {erro && !jaImportado ? (
          <p role="alert" className="texto-body text-danger-fg">
            {mensagem(erro)}
          </p>
        ) : null}
      </div>
    );
    const rotuloGravar = estado.gravando
      ? T.gravando
      : erro
        ? ROTULOS.tentar_de_novo
        : conferencia.incompleta
          ? T.importar_mesmo_assim
          : T.importar;
    acoes = jaImportado || erro === "auth.sessao_expirou" ? (
      cancelar
    ) : (
      <>
        {cancelar}
        <Botao variante="primario" disabled={estado.gravando} onClick={() => void gravar()}>
          {rotuloGravar}
        </Botao>
      </>
    );
  }

  return (
    <Janela
      aberta={aberta}
      aoMudar={(nova) => {
        if (nova) aoMudar(true);
        else fechar();
      }}
      titulo={T.titulo}
      descricao={rotuloPassoImportar(passo)}
      rodape={ocupado ? cancelar : acoes}
    >
      {corpo}
    </Janela>
  );
}
