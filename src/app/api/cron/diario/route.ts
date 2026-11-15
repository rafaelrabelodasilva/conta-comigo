import { autorizadoPeloCron, segredoDoCron } from "@/server/cron";
import { log } from "@/server/log";
import { materializarContasDoDia } from "@/server/materializar-contas";
import { criarClienteAdmin } from "@/server/supabase-admin";

// GET /api/cron/diario (AD-13): chamado todos os dias pelo Vercel Cron
// (`vercel.json`, `0 12 * * *` UTC = 09:00 em Brasília) com
// `Authorization: Bearer CRON_SECRET`. Sem o segredo certo responde 401 e não
// lê nem grava nada (o cliente do Supabase nem é criado).
//
// Hoje faz uma coisa: materializa as Contas manuais até o Mês atual + 12
// (`materializarContasDoDia`, AD-15). Essa leitura também mantém o projeto
// Supabase Free ativo. O log leva só rota, status, duração e quantidades
// (AD-17), nunca Nomes nem Valores. A resposta é mínima: `{ ok, quantidade }`.
//
// PONTO DE EXTENSÃO (FR-55, história própria): depois da materialização entram
// as funções de lembrete e atraso do núcleo e o envio por Web Push. Nada disso
// existe ainda; quando existir, fica neste ponto, depois do `await` da
// materialização, e uma falha dele não pode desfazer o que já foi gravado.

export const runtime = "nodejs";
export const maxDuration = 60;

const ROTA = "/api/cron/diario";

type Corpo = { ok: boolean; quantidade?: number; erro?: string };

function responder(status: number, corpo: Corpo, inicio: number, codigo: string, quantidade?: number) {
  log("cron.diario", {
    nivel: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
    codigo,
    campos: {
      rota: ROTA,
      metodo: "GET",
      status_http: status,
      duracao_ms: Date.now() - inicio,
      ...(quantidade === undefined ? {} : { quantidade }),
    },
  });
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const inicio = Date.now();

  // Primeiro de tudo: sem o segredo certo, nada é criado, lido ou gravado.
  if (!autorizadoPeloCron(request.headers.get("authorization"), segredoDoCron())) {
    return responder(401, { ok: false, erro: "cron.nao_autorizado" }, inicio, "cron.nao_autorizado");
  }

  const admin = criarClienteAdmin();
  if (!admin) {
    return responder(503, { ok: false, erro: "cron.indisponivel" }, inicio, "cron.indisponivel");
  }

  const resultado = await materializarContasDoDia(admin, new Date());

  // Contas que não deram para ler: avisa (só a contagem) e segue.
  if (resultado.ilegiveis > 0) {
    log("cron.diario.conta_ilegivel", {
      nivel: "warn",
      codigo: "cron.conta_ilegivel",
      campos: { rota: ROTA, quantidade: resultado.ilegiveis },
    });
  }

  if (!resultado.ok) {
    if (resultado.codigo === "cron.materializacao_falhou") {
      log("cron.diario.materializacao_falhou", {
        nivel: "error",
        codigo: resultado.codigo,
        campos: { rota: ROTA, quantidade: resultado.falhas },
      });
    }
    return responder(
      500,
      { ok: false, erro: "cron.falhou", quantidade: resultado.quantidade },
      inicio,
      resultado.codigo,
      resultado.quantidade,
    );
  }

  return responder(200, { ok: true, quantidade: resultado.quantidade }, inicio, "cron.materializou", resultado.quantidade);
}
