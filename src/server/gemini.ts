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
//
// O plano gratuito às vezes responde 503 ("alta demanda", passageiro): aí a
// mesma chamada é refeita até 2 vezes, com espera curta, enquanto sobrar
// tempo dentro do limite.

/** Modelo usado se `GEMINI_MODEL` estiver vazio: o Flash gratuito vigente. */
export const MODELO_PADRAO = "gemini-flash-latest";

/** Abaixo dos 60 s da rota (`maxDuration`), com folga para responder. */
export const TEMPO_LIMITE_MS = 55_000;

const ESQUEMA_JSON = z.toJSONSchema(ESQUEMA_EXTRACAO);

/** Esperas antes de cada nova tentativa depois de um 503 (até 2). */
export const ESPERAS_503_MS = [2_000, 4_000] as const;

/** Só tenta de novo se sobrar pelo menos isto de tempo depois da espera. */
const TEMPO_MINIMO_TENTATIVA_MS = 10_000;

type ErroExtracao =
  | "fatura.leitura_indisponivel"
  | "fatura.leitura_falhou"
  | "fatura.leitura_ocupada"
  | "fatura.tempo_esgotado";

function erro(codigo: ErroExtracao, detalhe?: string): Resultado<never> {
  return { ok: false, erro: detalhe ? { codigo, detalhe } : { codigo } };
}

export type OpcoesExtracao = {
  /** Para testes: tempo limite menor. */
  tempoLimiteMs?: number;
  /** Para testes: espera entre tentativas. */
  esperar?: (ms: number, sinal: AbortSignal) => Promise<void>;
};

function esperarComSinal(ms: number, sinal: AbortSignal): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    const relogio = setTimeout(resolver, ms);
    sinal.addEventListener("abort", () => {
      clearTimeout(relogio);
      rejeitar(sinal.reason);
    }, { once: true });
  });
}

function statusDoErro(e: unknown): number | null {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

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
  const limiteMs = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_MS;
  const fim = Date.now() + limiteMs;
  const sinal = AbortSignal.timeout(limiteMs);
  const esperar = opcoes.esperar ?? esperarComSinal;
  const cliente = new GoogleGenAI({ apiKey });

  let resposta: string | undefined;
  for (let tentativa = 0; ; tentativa++) {
    try {
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
      break;
    } catch (e) {
      if (ehTempoEsgotado(e, sinal)) return erro("fatura.tempo_esgotado");
      const status = statusDoErro(e);
      if (status !== 503) return erro("fatura.leitura_falhou", status ? `http_${status}` : "excecao");
      const espera = ESPERAS_503_MS[tentativa];
      if (espera === undefined || fim - Date.now() - espera < TEMPO_MINIMO_TENTATIVA_MS) {
        return erro("fatura.leitura_ocupada", `http_503_x${tentativa + 1}`);
      }
      try {
        await esperar(espera, sinal);
      } catch {
        return erro("fatura.tempo_esgotado");
      }
    }
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
