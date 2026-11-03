"use client";

import { useState, type FormEvent } from "react";
import { removerDadosPessoais } from "@/domain/dados-pessoais";
import { formatarReais } from "@/domain/dinheiro";
import type { Extracao, ResumoExtracao } from "@/domain/extracao-fatura";
import { ITENS_QUADRO_PROVA, TEXTOS_PROVA_FATURA as T, mensagem, rotuloCartaoFinal } from "@/domain/mensagens";
import { formatarSegundos, montarQuadroProva } from "@/domain/prova-fatura";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { lerPdf } from "./ler-pdf";

// Página de prova técnica (História 2.1): abre o PDF com a senha aqui,
// limpa os dados pessoais pelo núcleo, manda só o texto para
// `POST /api/fatura/extrair` e mostra o quadro "esperado × lido" de
// outubro/2026 e os tempos. Não grava nada.

type RespostaExtracao = { extracao: Extracao; resumo: ResumoExtracao; servidor_ms: number; gemini_ms?: number };
type Tempos = { abrirMs: number; servidorMs: number; geminiMs: number | null; totalMs: number };
type Fase = "parado" | "abrindo" | "lendo";

const NOME_ARQUIVO_TEXTO = "fatura-texto-sem-dados-pessoais.txt";

function baixarTexto(texto: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = NOME_ARQUIVO_TEXTO;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // O Safari do iPad pode começar o download depois: só revoga em 60 s.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A resposta 200 tem a forma mínima que a tela usa? */
function ehRespostaExtracao(corpo: unknown): corpo is RespostaExtracao {
  const c = corpo as Partial<Record<keyof RespostaExtracao, unknown>> | null;
  return (
    typeof c === "object" &&
    c !== null &&
    typeof c.resumo === "object" &&
    c.resumo !== null &&
    typeof c.extracao === "object" &&
    c.extracao !== null &&
    Array.isArray((c.extracao as { lancamentos?: unknown }).lancamentos) &&
    typeof c.servidor_ms === "number"
  );
}

async function codigoDaResposta(r: Response): Promise<string> {
  if (r.status === 401) return "auth.sessao_expirou";
  if (r.status === 504) return "fatura.tempo_esgotado";
  try {
    const corpo = (await r.json()) as { erro?: unknown };
    return typeof corpo.erro === "string" ? corpo.erro : "fatura.leitura_falhou";
  } catch {
    return "fatura.leitura_falhou";
  }
}

function reaisOuNaoLido(centavos: number | null | undefined): string {
  return typeof centavos === "number" ? formatarReais(centavos) : T.nao_lido;
}

export function ProvaFatura() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const [fase, setFase] = useState<Fase>("parado");
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [textoLimpo, setTextoLimpo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ resposta: RespostaExtracao; tempos: Tempos } | null>(null);

  const ocupado = fase !== "parado";

  async function ler(e: FormEvent) {
    e.preventDefault();
    setErroArquivo(null);
    setErroSenha(null);
    setErroGeral(null);
    setResultado(null);
    if (!arquivo) {
      setErroArquivo(mensagem("fatura.sem_arquivo"));
      return;
    }

    const inicio = performance.now();
    setFase("abrindo");
    // Um buffer novo a cada tentativa: o pdf.js consome o que recebe, e a
    // senha errada não obriga a escolher o PDF de novo.
    let lido;
    try {
      lido = await lerPdf(new Uint8Array(await arquivo.arrayBuffer()), senha);
    } catch {
      lido = { ok: false as const, erro: { codigo: "fatura.pdf_invalido" } };
    }
    if (!lido.ok) {
      setFase("parado");
      const codigo = lido.erro.codigo;
      if (codigo === "fatura.senha_incorreta" || codigo === "fatura.senha_vazia") setErroSenha(mensagem(codigo));
      else setErroGeral(mensagem(codigo));
      return;
    }
    const abrirMs = performance.now() - inicio;
    const texto = removerDadosPessoais(lido.valor.texto);
    setTextoLimpo(texto);

    setFase("lendo");
    let resposta: Response;
    try {
      resposta = await fetch("/api/fatura/extrair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto }),
      });
    } catch {
      setFase("parado");
      setErroGeral(mensagem("fatura.conexao_caiu"));
      return;
    }
    // Redirecionada (ex.: para Entrar): a sessão caiu no caminho.
    if (resposta.redirected) {
      setFase("parado");
      setErroGeral(mensagem("auth.sessao_expirou"));
      return;
    }
    if (!resposta.ok) {
      setFase("parado");
      setErroGeral(mensagem(await codigoDaResposta(resposta)));
      return;
    }
    let corpo: unknown;
    try {
      corpo = await resposta.json();
    } catch {
      corpo = null;
    }
    if (!ehRespostaExtracao(corpo)) {
      setFase("parado");
      setErroGeral(mensagem("fatura.leitura_falhou"));
      return;
    }
    const totalMs = performance.now() - inicio;
    setFase("parado");
    setResultado({ resposta: corpo, tempos: { abrirMs, servidorMs: corpo.servidor_ms, geminiMs: typeof corpo.gemini_ms === "number" ? corpo.gemini_ms : null, totalMs } });
  }

  const quadro = resultado ? montarQuadroProva(resultado.resposta.resumo, resultado.tempos.totalMs) : [];
  const fatura = resultado?.resposta.extracao.fatura;

  return (
    <div className="flex flex-col gap-4">
      <p className="texto-body text-text-muted">{T.explicacao}</p>

      <form onSubmit={(e) => void ler(e)} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
        <Campo
          rotulo={T.arquivo}
          type="file"
          accept="application/pdf,.pdf"
          disabled={ocupado}
          erro={erroArquivo}
          className="py-2"
          onChange={(e) => {
            // Cancelar o seletor não descarta o PDF já escolhido.
            const escolhido = e.target.files?.[0];
            if (!escolhido) return;
            setArquivo(escolhido);
            setResultado(null);
            setErroArquivo(null);
            setErroSenha(null);
            setErroGeral(null);
            setTextoLimpo(null);
          }}
        />
        <Campo
          rotulo={T.senha}
          type="password"
          autoComplete="off"
          value={senha}
          disabled={ocupado}
          erro={erroSenha}
          onChange={(e) => {
            setSenha(e.target.value);
            setErroSenha(null);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Botao type="submit" variante="primario" disabled={ocupado}>
            {T.ler}
          </Botao>
          {textoLimpo ? (
            <Botao onClick={() => baixarTexto(textoLimpo)} disabled={ocupado}>
              {T.baixar_texto}
            </Botao>
          ) : null}
        </div>
        <p role="status" className="texto-body text-text-muted">
          {fase === "abrindo" ? T.abrindo : fase === "lendo" ? T.lendo : ""}
        </p>
        {erroGeral ? (
          <p role="alert" className="texto-body text-danger-fg">
            {erroGeral}
          </p>
        ) : null}
      </form>

      {resultado && fatura ? (
        <>
          <section aria-labelledby="titulo-quadro" className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <h2 id="titulo-quadro" className="texto-body-strong">
              {T.quadro}
            </h2>
            <table className="w-full texto-body">
              <thead>
                <tr className="text-left text-text-muted">
                  <th className="py-1">{T.coluna_item}</th>
                  <th className="py-1 text-right">{T.coluna_esperado}</th>
                  <th className="py-1 text-right">{T.coluna_lido}</th>
                  <th className="py-1 text-right">{T.coluna_ok}</th>
                </tr>
              </thead>
              <tbody>
                {quadro.map((l) => (
                  <tr key={l.item} data-item={l.item} className="border-t border-border-subtle">
                    <td className="py-1">{ITENS_QUADRO_PROVA[l.item]}</td>
                    <td className="py-1 text-right texto-number">{l.esperado}</td>
                    <td className="py-1 text-right texto-number">{l.lido}</td>
                    <td className={l.ok ? "py-1 text-right" : "py-1 text-right texto-body-strong text-danger-fg"}>
                      {l.ok ? T.bateu : T.nao_bateu}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="texto-body-strong">{T.tempos}</h3>
            <ul className="texto-body">
              <li>
                {T.tempo_abrir}: <span className="texto-number">{formatarSegundos(resultado.tempos.abrirMs)}</span>
              </li>
              <li>
                {T.tempo_servidor}: <span className="texto-number">{formatarSegundos(resultado.tempos.servidorMs)}</span>
              </li>
              {resultado.tempos.geminiMs === null ? null : (
                <li>
                  {T.tempo_gemini}: <span className="texto-number">{formatarSegundos(resultado.tempos.geminiMs)}</span>
                </li>
              )}
              <li>
                {T.tempo_total}: <span className="texto-number">{formatarSegundos(resultado.tempos.totalMs)}</span>
              </li>
            </ul>

            <h3 className="texto-body-strong">{T.dados_fatura}</h3>
            <ul className="texto-body">
              <li>
                {T.vencimento}: <span className="texto-number">{fatura.vencimento}</span>
              </li>
              <li>
                {T.fechamento}: <span className="texto-number">{fatura.fechamento ?? T.nao_lido}</span>
              </li>
              <li>
                {T.saldo_anterior}: <span className="texto-number">{reaisOuNaoLido(fatura.saldoAnteriorCentavos)}</span>
              </li>
              <li>
                {T.pagamentos}: <span className="texto-number">{reaisOuNaoLido(fatura.pagamentosCentavos)}</span>
              </li>
              <li>
                {T.total_a_pagar}: <span className="texto-number">{reaisOuNaoLido(fatura.totalAPagarCentavos)}</span>
              </li>
              <li>
                {T.com_duvida}: <span className="texto-number">{resultado.resposta.resumo.duvidas}</span>
              </li>
            </ul>

            <h3 className="texto-body-strong">{T.por_cartao}</h3>
            <ul className="texto-body">
              {resultado.resposta.resumo.porCartao.map((c) => (
                <li key={c.final} className={c.diferencaCentavos === 0 ? undefined : "text-danger-fg"}>
                  {rotuloCartaoFinal(c.final)}: {formatarReais(c.lidoCentavos)} · {formatarReais(c.despesasCentavos)}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="titulo-lista" className="flex flex-col gap-2 overflow-x-auto rounded-lg border border-border bg-surface p-3">
            <h2 id="titulo-lista" className="texto-body-strong">
              {T.lista}
            </h2>
            <table className="w-full texto-body">
              <thead>
                <tr className="text-left text-text-muted">
                  <th className="py-1">{T.coluna_data}</th>
                  <th className="py-1">{T.coluna_nome}</th>
                  <th className="py-1">{T.coluna_parcela}</th>
                  <th className="py-1 text-right">{T.coluna_valor}</th>
                  <th className="py-1">{T.coluna_cartao}</th>
                  <th className="py-1">{T.coluna_tipo}</th>
                  <th className="py-1">{T.coluna_duvida}</th>
                </tr>
              </thead>
              <tbody>
                {resultado.resposta.extracao.lancamentos.map((l, i) => (
                  <tr key={i} className="border-t border-border-subtle">
                    <td className="py-1 texto-number">{l.data}</td>
                    <td className="py-1">{l.nome}</td>
                    <td className="py-1 texto-number">
                      {l.parcelaN === null ? "" : `${String(l.parcelaN).padStart(2, "0")}/${String(l.parcelaTotal).padStart(2, "0")}`}
                    </td>
                    <td className="py-1 text-right texto-number">{formatarReais(l.valorCentavos)}</td>
                    <td className="py-1 texto-number">{l.finalCartao}</td>
                    <td className="py-1">{l.tipoSugerido ?? ""}</td>
                    <td className="py-1">{l.duvida ? T.duvida_sim : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </div>
  );
}
