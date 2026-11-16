// Apoio aos testes de integração (Histórias 1.6, 1.7, 2.3 e 3.1) (Supabase local): clientes,
// usuários de teste com limpeza e espera de um evento do Realtime.
// Só usado com INTEGRACAO_SUPABASE=1 e as chaves de `supabase status -o env`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect } from "vitest";
import type { Database } from "../../src/data/database.types";

export const ligado = process.env.INTEGRACAO_SUPABASE === "1";

export type Cliente = SupabaseClient<Database>;
export type Usuario = { id: string; email: string; senha: string; cliente: Cliente };

const semSessao = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

function variavel(...nomes: string[]): string {
  for (const nome of nomes) {
    const valor = process.env[nome];
    if (valor) return valor;
  }
  throw new Error(`Faltam as variáveis ${nomes.join(" ou ")} (supabase status -o env).`);
}

/** Admin, criação de usuários (com sessão própria) e limpeza das tabelas de negócio. */
export function supabaseLocal(prefixo: string) {
  const url = variavel("API_URL", "SUPABASE_URL");
  const chavePublica = variavel("PUBLISHABLE_KEY", "ANON_KEY");
  const admin = createClient<Database>(url, variavel("SECRET_KEY", "SERVICE_ROLE_KEY"), semSessao);
  const usuarios: Usuario[] = [];

  async function entrar(email: string, senha: string): Promise<Cliente> {
    const cliente = createClient<Database>(url, chavePublica, semSessao);
    const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha });
    expect(error).toBeNull();
    cliente.realtime.setAuth(data.session!.access_token);
    return cliente;
  }

  async function criarUsuario(apelido: string): Promise<Usuario> {
    const email = `${apelido}.${prefixo}+${Date.now()}@example.com`;
    const senha = `Senha-${apelido}-${Date.now()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });
    expect(error).toBeNull();
    const usuario = { id: data.user!.id, email, senha, cliente: await entrar(email, senha) };
    usuarios.push(usuario);
    return usuario;
  }

  async function limpar() {
    for (const u of usuarios) {
      await admin.from("pagamento_itens").delete().eq("owner_id", u.id);
      await admin.from("pagamentos").delete().eq("owner_id", u.id);
      await admin.from("blocos").delete().eq("owner_id", u.id);
      await admin.from("regras").delete().eq("owner_id", u.id);
      await admin.from("lancamentos").delete().eq("owner_id", u.id);
      await admin.from("series").delete().eq("owner_id", u.id);
      await admin.from("contas_manuais").delete().eq("owner_id", u.id);
      await admin.from("fatura_cartoes").delete().eq("owner_id", u.id);
      await admin.from("faturas").delete().eq("owner_id", u.id);
      await admin.from("config_ciclo").delete().eq("owner_id", u.id);
      await admin.from("configuracoes").delete().eq("owner_id", u.id);
      await admin.from("status").delete().eq("owner_id", u.id);
      await admin.from("tipos").delete().eq("owner_id", u.id);
      await admin.from("responsaveis").delete().eq("owner_id", u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
  }

  return { admin, anonimo: createClient<Database>(url, chavePublica, semSessao), entrar, criarUsuario, limpar };
}

/**
 * Espera um evento (`INSERT`, `UPDATE` ou `DELETE`) de `tabela` que satisfaça
 * `aceita` chegar a `ouvinte`. `aceita` recebe `new` no INSERT e no UPDATE e
 * `old` no DELETE.
 * O Realtime pode levar um instante para ligar o postgres_changes depois do
 * SUBSCRIBED: `gravar` é chamado de novo a cada 2 s até o evento chegar.
 * Sempre remove o canal e para de gravar, também em falha.
 */
export async function esperarEvento<T>(
  ouvinte: Cliente,
  tabela: "status" | "configuracoes" | "config_ciclo" | "faturas" | "fatura_cartoes" | "lancamentos" | "regras" | "contas_manuais" | "pagamentos" | "pagamento_itens",
  evento: "INSERT" | "UPDATE" | "DELETE",
  aceita: (linha: T) => boolean,
  gravar: (tentativa: number) => PromiseLike<unknown>,
): Promise<T> {
  let repetidor: ReturnType<typeof setInterval> | undefined;
  let canal: ReturnType<Cliente["channel"]> | undefined;
  const status: string[] = [];
  try {
    return await new Promise<T>((resolver, rejeitar) => {
      const limite = setTimeout(
        () => rejeitar(new Error(`${evento} de ${tabela} não chegou (canal: ${status.join(", ")})`)),
        25_000,
      );
      canal = ouvinte
        .channel(`teste-${tabela}-${Date.now()}`)
        .on("postgres_changes", { event: evento, schema: "public", table: tabela }, (payload) => {
          const linha = (evento === "DELETE" ? payload.old : payload.new) as T;
          if (!aceita(linha)) return;
          clearTimeout(limite);
          resolver(linha);
        })
        .subscribe((s, erro) => {
          status.push(erro ? `${s} (${erro.message})` : s);
          if (s !== "SUBSCRIBED" || repetidor) return;
          let tentativa = 0;
          // O supabase-js só manda a consulta quando alguém chama `then`.
          const disparar = () => void Promise.resolve(gravar(++tentativa)).then(() => {});
          disparar();
          repetidor = setInterval(disparar, 2_000);
        });
    });
  } finally {
    clearInterval(repetidor);
    if (canal) await ouvinte.removeChannel(canal);
  }
}

/**
 * O plano de reimportação "apagar tudo" (História 3.12): nenhuma linha nova
 * pareia com as antigas, então todas as linhas vivas da Fatura são apagadas
 * (as excluídas a RPC apaga sozinha). Reproduz a reimportação simplificada da
 * 3.11 para os testes que só olham o que sai e o que entra.
 */
export async function planoApagarTudo(cliente: Cliente, faturaId: string) {
  const { data } = await cliente
    .from("lancamentos")
    .select("id")
    .eq("fatura_id", faturaId)
    .is("excluido_em", null)
    .is("dividido_de_id", null);
  return { apagar: (data ?? []).map((l) => l.id), sumiram: [] as string[], voltar_a_previsto: [] as string[] };
}
