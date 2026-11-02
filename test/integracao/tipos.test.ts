// Prova, contra o Supabase local (CI), a tabela `tipos` da História 1.5:
// RLS por dono, `owner_id` e `updated_at` definidos pelo banco, restrição de
// nome e evento do Realtime chegando a outro cliente do mesmo dono.
//
// Só roda com INTEGRACAO_SUPABASE=1 e as chaves de `supabase status -o env`.
// No `npm test` local, sem banco, fica de fora.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/data/database.types";

const ligado = process.env.INTEGRACAO_SUPABASE === "1";

function variavel(...nomes: string[]): string {
  for (const nome of nomes) {
    const valor = process.env[nome];
    if (valor) return valor;
  }
  throw new Error(`Faltam as variáveis ${nomes.join(" ou ")} (supabase status -o env).`);
}

const semSessao = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

type Cliente = SupabaseClient<Database>;
type Usuario = { id: string; email: string; senha: string; cliente: Cliente };

describe.skipIf(!ligado)("Tipos no Supabase local", () => {
  let url: string;
  let chavePublica: string;
  let admin: Cliente;
  const usuarios: Usuario[] = [];

  async function entrar(email: string, senha: string): Promise<Cliente> {
    const cliente = createClient<Database>(url, chavePublica, semSessao);
    const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha });
    expect(error).toBeNull();
    cliente.realtime.setAuth(data.session!.access_token);
    return cliente;
  }

  async function criarUsuario(apelido: string): Promise<Usuario> {
    const email = `${apelido}.tipo+${Date.now()}@example.com`;
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

  let a: Usuario;
  let b: Usuario;

  beforeAll(async () => {
    url = variavel("API_URL", "SUPABASE_URL");
    chavePublica = variavel("PUBLISHABLE_KEY", "ANON_KEY");
    admin = createClient<Database>(url, variavel("SECRET_KEY", "SERVICE_ROLE_KEY"), semSessao);
    a = await criarUsuario("a");
    b = await criarUsuario("b");
  });

  afterAll(async () => {
    for (const u of usuarios) {
      await admin.from("tipos").delete().eq("owner_id", u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
  });

  it("owner_id e updated_at vêm do banco", async () => {
    const { data, error } = await a.cliente
      .from("tipos")
      .insert({ nome: "Casa", updated_at: "2000-01-01T00:00:00Z" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data!.owner_id).toBe(a.id);
    expect(new Date(data!.updated_at).getFullYear()).toBeGreaterThan(2000);
    expect(data!.arquivado).toBe(false);

    const { data: alterada } = await a.cliente
      .from("tipos")
      .update({ nome: "Lar", updated_at: "2000-01-01T00:00:00Z" })
      .eq("id", data!.id)
      .select()
      .single();
    expect(alterada!.nome).toBe("Lar");
    expect(new Date(alterada!.updated_at).getTime()).toBeGreaterThan(
      new Date(data!.updated_at).getTime(),
    );
  });

  it("não grava em nome de outro dono", async () => {
    const { error } = await a.cliente.from("tipos").insert({ nome: "Intruso", owner_id: b.id });
    expect(error?.code).toBe("42501");
  });

  it("outro usuário não lê, não altera e não apaga", async () => {
    const { data: proprio, error } = await a.cliente
      .from("tipos")
      .insert({ nome: "Só de A" })
      .select()
      .single();
    expect(error).toBeNull();
    const id = proprio!.id;

    const { data: lidos } = await b.cliente.from("tipos").select("*");
    expect(lidos).toEqual([]);

    const { data: alterados } = await b.cliente
      .from("tipos")
      .update({ nome: "Invadido" })
      .eq("id", id)
      .select();
    expect(alterados).toEqual([]);

    const { data: apagados } = await b.cliente.from("tipos").delete().eq("id", id).select();
    expect(apagados).toEqual([]);

    const { data: depois } = await a.cliente.from("tipos").select("*").eq("id", id).single();
    expect(depois).not.toBeNull();
    expect(depois!.nome).not.toBe("Invadido");
  });

  it("não passa a própria linha para outro dono", async () => {
    const { data: proprio, error } = await a.cliente
      .from("tipos")
      .insert({ nome: "Mudança de dono" })
      .select()
      .single();
    expect(error).toBeNull();

    const { data: movidos, error: erroMover } = await a.cliente
      .from("tipos")
      .update({ owner_id: b.id })
      .eq("id", proprio!.id)
      .select();
    // O `with check` recusa (42501) ou nenhuma linha muda.
    if (erroMover) expect(erroMover.code).toBe("42501");
    else expect(movidos).toEqual([]);

    const { data: depois } = await admin.from("tipos").select("*").eq("id", proprio!.id).single();
    expect(depois!.owner_id).toBe(a.id);
  });

  it("recusa nome inválido", async () => {
    for (const nome of ["", " Casa", "Casa ", "x".repeat(31)]) {
      const { error } = await a.cliente.from("tipos").insert({ nome });
      expect(error?.code).toBe("23514");
    }
    const { error } = await a.cliente.from("tipos").insert({ nome: "x".repeat(30) });
    expect(error).toBeNull();
  });

  it("o evento do Realtime chega a um segundo cliente do mesmo dono e não a outro dono", async () => {
    const outroAparelho = await entrar(a.email, a.senha);
    const { data: alvo, error: erroAlvo } = await a.cliente
      .from("tipos")
      .insert({ nome: "Gatos" })
      .select()
      .single();
    expect(erroAlvo).toBeNull();

    // Usuário B escuta a mesma tabela: não pode receber nada da linha de A.
    const eventosDeB: unknown[] = [];
    let repetidor: ReturnType<typeof setInterval> | undefined;
    let canal: ReturnType<Cliente["channel"]> | undefined;
    const canalB = b.cliente
      .channel("teste-tipos-b")
      .on("postgres_changes", { event: "*", schema: "public", table: "tipos" }, (payload) => {
        const nova = payload.new as { id?: string };
        const antiga = payload.old as { id?: string };
        if (nova?.id === alvo!.id || antiga?.id === alvo!.id) eventosDeB.push(payload);
      });
    try {
      await new Promise<void>((resolver, rejeitar) => {
        const limite = setTimeout(() => rejeitar(new Error("canal de B não conectou")), 15_000);
        canalB.subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          clearTimeout(limite);
          resolver();
        });
      });

      // O Realtime pode levar um instante para ligar o postgres_changes depois
      // do SUBSCRIBED: grava de novo a cada 2 s até o evento chegar.
      const statusA: string[] = [];
      const gravacoes: string[] = [];
      const recebido = new Promise<{ id: string; nome: string }>((resolver, rejeitar) => {
        const limite = setTimeout(() => {
          clearInterval(repetidor);
          rejeitar(
            new Error(
              `evento não chegou (status do canal: ${statusA.join(", ")}; gravações: ${gravacoes.join(", ")})`,
            ),
          );
        }, 25_000);
        canal = outroAparelho
          .channel("teste-tipos")
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tipos" }, (payload) => {
            const nova = payload.new as { id: string; nome: string };
            if (nova.id !== alvo!.id || !nova.nome.startsWith("Gatos ")) return;
            clearTimeout(limite);
            clearInterval(repetidor);
            resolver(nova);
          })
          .subscribe((status, erro) => {
            statusA.push(erro ? `${status} (${erro.message})` : status);
            if (status !== "SUBSCRIBED" || repetidor) return;
            let tentativa = 0;
            const gravar = () =>
              // O supabase-js só manda a consulta quando alguém chama `then`.
              void a.cliente
                .from("tipos")
                .update({ nome: `Gatos ${++tentativa}` })
                .eq("id", alvo!.id)
                .then(({ error }) => gravacoes.push(error ? `erro ${error.code}` : "ok"));
            gravar();
            repetidor = setInterval(gravar, 2_000);
          });
      });

      const nova = await recebido;
      expect(nova.nome).toMatch(/^Gatos \d+$/);
      // Dá tempo de um eventual evento indevido chegar ao canal de B.
      await new Promise((r) => setTimeout(r, 1_000));
      expect(eventosDeB).toEqual([]);
    } finally {
      // Também em falha ou tempo esgotado: nada fica gravando nem escutando.
      clearInterval(repetidor);
      if (canal) await outroAparelho.removeChannel(canal);
      await b.cliente.removeChannel(canalB);
    }
  }, 40_000);
});
