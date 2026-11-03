import { removerDadosPessoais } from "@/domain/dados-pessoais";
import { converterExtracao, ESQUEMA_PEDIDO_EXTRACAO, resumirExtracao } from "@/domain/extracao-fatura";
import { criarClienteServidor } from "@/data/supabase/servidor";
import { lerNomesTiposAtivos } from "@/data/tipos-servidor";
import { extrairFatura, TEMPO_LIMITE_MS } from "@/server/gemini";
import { log } from "@/server/log";

// POST /api/fatura/extrair (AD-7): recebe só o texto da Fatura já sem dados
// pessoais, faz uma chamada ao Gemini e devolve a extração em centavos, o
// resumo da Conferência e os tempos (servidor inteiro e só o Gemini). Não grava nada. O log leva só
// código, status, duração e quantidade (AD-17), nunca o texto.

export const runtime = "nodejs";
export const maxDuration = 60;

const ROTA = "/api/fatura/extrair";

const STATUS_DO_ERRO: Record<string, number> = {
  "fatura.leitura_indisponivel": 503,
  "fatura.tempo_esgotado": 504,
  "fatura.leitura_falhou": 502,
  "fatura.leitura_ocupada": 503,
};

function responder(status: number, corpo: unknown, inicio: number, codigo?: string, quantidade?: number) {
  log("fatura.extrair", {
    nivel: status >= 500 ? (status === 503 ? "warn" : "error") : status >= 400 ? "warn" : "info",
    codigo,
    campos: {
      rota: ROTA,
      metodo: "POST",
      status_http: status,
      duracao_ms: Date.now() - inicio,
      ...(quantidade === undefined ? {} : { quantidade }),
    },
  });
  return Response.json(corpo, { status });
}

export async function POST(request: Request) {
  const inicio = Date.now();

  // Sessão conferida aqui, sem depender do proxy (AD-12).
  const supabase = await criarClienteServidor();
  let autenticado = false;
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.getClaims();
      autenticado = !error && Boolean(data?.claims);
    } catch {
      autenticado = false;
    }
  }
  if (!supabase || !autenticado) {
    return responder(401, { erro: "auth.sessao_expirou" }, inicio, "auth.sessao_expirou");
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    corpo = null;
  }
  const pedido = ESQUEMA_PEDIDO_EXTRACAO.safeParse(corpo);
  if (!pedido.success) {
    return responder(400, { erro: "fatura.requisicao_invalida" }, inicio, "fatura.requisicao_invalida");
  }

  // Sem os Tipos, a extração segue sem sugestão de Tipo.
  const tipos = await lerNomesTiposAtivos(supabase);
  if (!tipos.ok) log("fatura.tipos_falhou", { nivel: "warn", codigo: tipos.codigo, campos: { rota: ROTA } });
  const nomes = tipos.ok ? tipos.nomes : [];

  // Segunda barreira: limpa de novo, caso o texto não tenha vindo limpo.
  const texto = removerDadosPessoais(pedido.data.texto);
  // O tempo da sessão e dos Tipos sai do limite do Gemini (mínimo 1 s).
  const tempoLimiteMs = Math.max(1_000, TEMPO_LIMITE_MS - (Date.now() - inicio));
  const inicioGemini = Date.now();
  const lida = await extrairFatura(texto, nomes, { tempoLimiteMs });
  const geminiMs = Date.now() - inicioGemini;
  if (!lida.ok) {
    const codigo = lida.erro.codigo;
    // O detalhe é só um identificador (ex.: "http_429", "lancamentos.3.valor").
    if (lida.erro.detalhe) log("fatura.gemini_falhou", { nivel: "warn", codigo: lida.erro.detalhe, campos: { rota: ROTA } });
    return responder(STATUS_DO_ERRO[codigo] ?? 502, { erro: codigo }, inicio, codigo);
  }

  const extracao = converterExtracao(lida.valor, nomes);
  if (!extracao.ok) {
    if (extracao.erro.detalhe) {
      log("fatura.gemini_falhou", { nivel: "warn", codigo: extracao.erro.detalhe, campos: { rota: ROTA } });
    }
    return responder(502, { erro: "fatura.leitura_falhou" }, inicio, "fatura.leitura_falhou");
  }
  const resumo = resumirExtracao(extracao.valor);
  const servidorMs = Date.now() - inicio;
  return responder(
    200,
    { extracao: extracao.valor, resumo, servidor_ms: servidorMs, gemini_ms: geminiMs },
    inicio,
    "fatura.extraida",
    resumo.quantidade,
  );
}
