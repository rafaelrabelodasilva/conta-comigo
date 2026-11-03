import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { ESQUEMA_EXTRACAO, validarExtracao, type ExtracaoBruta } from "@/domain/extracao-fatura";
import type { Resultado } from "@/domain/resultado";
import { INSTRUCAO_EXTRACAO, montarPedidoExtracao } from "./prompt-extracao";

// Cliente do Gemini (AD-7, AD-12). A chave e o modelo vêm só das variáveis
// de ambiente do servidor, lidas a cada chamada. Uma única chamada
// `generateContent` por extração, com o JSON Schema gerado do schema único
// do núcleo, e a resposta validada pelo mesmo schema. Nada aqui registra o
// texto da Fatura.

/** Modelo usado se `GEMINI_MODEL` estiver vazio: o Flash gratuito vigente. */
export const MODELO_PADRAO = "gemini-flash-latest";

/** Abaixo dos 60 s da rota (`maxDuration`), com folga para responder. */
export const TEMPO_LIMITE_MS = 55_000;

const ESQUEMA_JSON = z.toJSONSchema(ESQUEMA_EXTRACAO);

type ErroExtracao = "fatura.leitura_indisponivel" | "fatura.leitura_falhou" | "fatura.tempo_esgotado";

function erro(codigo: ErroExtracao, detalhe?: string): Resultado<never> {
  return { ok: false, erro: detalhe ? { codigo, detalhe } : { codigo } };
}

export type OpcoesExtracao = {
  /** Para testes: tempo limite menor. */
  tempoLimiteMs?: number;
};

function ehTempoEsgotado(e: unknown, sinal: AbortSignal): boolean {
  if (sinal.aborted) return true;
  const nome = e instanceof Error ? e.name : "";
  return nome === "AbortError" || nome === "TimeoutError";
}

/** Extrai a Fatura do texto já sem dados pessoais. */
export async function extrairFatura(
  texto: string,
  nomesTipos: readonly string[],
  opcoes: OpcoesExtracao = {},
): Promise<Resultado<ExtracaoBruta>> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return erro("fatura.leitura_indisponivel", "sem_chave");
  const modelo = process.env.GEMINI_MODEL?.trim() || MODELO_PADRAO;
  const sinal = AbortSignal.timeout(opcoes.tempoLimiteMs ?? TEMPO_LIMITE_MS);

  let resposta: string | undefined;
  try {
    const cliente = new GoogleGenAI({ apiKey });
    const r = await cliente.models.generateContent({
      model: modelo,
      contents: montarPedidoExtracao(texto, nomesTipos),
      config: {
        systemInstruction: INSTRUCAO_EXTRACAO,
        responseMimeType: "application/json",
        responseJsonSchema: ESQUEMA_JSON,
        abortSignal: sinal,
      },
    });
    resposta = r.text;
  } catch (e) {
    if (ehTempoEsgotado(e, sinal)) return erro("fatura.tempo_esgotado");
    const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : null;
    return erro("fatura.leitura_falhou", status ? `http_${status}` : "excecao");
  }

  if (!resposta) return erro("fatura.leitura_falhou", "resposta_vazia");
  let json: unknown;
  try {
    json = JSON.parse(resposta);
  } catch {
    return erro("fatura.leitura_falhou", "json_invalido");
  }
  return validarExtracao(json);
}
