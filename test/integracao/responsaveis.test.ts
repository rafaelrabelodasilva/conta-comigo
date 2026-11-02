// Prova, contra o Supabase local (CI), o padrão de tabela da História 1.4:
// RLS por dono, `owner_id` e `updated_at` definidos pelo banco, restrições
// de cor, RPC de reordenação e evento do Realtime chegando a outro cliente.
//
// Só roda com INTEGRACAO_SUPABASE=1 e as chaves de `supabase status -o env`.
// No `npm test` local, sem banco, fica de fora.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/data/database.types";
import { instanteMicros } from "../../src/data/realtime-estado";

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

describe.skipIf(!ligado)("Responsáveis no Supabase local", () => {
  let url: string;
  let chavePublica: string;
  let admin: Cliente;
  const usuarios: Usuario[] = [];

  async function criarUsuario(apelido: string): Promise<Usuario> {
    const email = `${apelido}.resp+${Date.now()}@example.com`;
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

  async function entrar(email: string, senha: string): Promise<Cliente> {
    const cliente = createClient<Database>(url, chavePublica, semSessao);
    const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha });
    expect(error).toBeNull();
    cliente.realtime.setAuth(data.session!.access_token);
    return cliente;
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
      await admin.from("responsaveis").delete().eq("owner_id", u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
  });

  it("owner_id e updated_at vêm do banco", async () => {
    const { data, error } = await a.cliente
      .from("responsaveis")
      .insert({ nome: "Rafael", cor: 1, ordem: 1, updated_at: "2000-01-01T00:00:00Z" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data!.owner_id).toBe(a.id);
    expect(new Date(data!.updated_at).getFullYear()).toBeGreaterThan(2000);
    expect(data!.arquivado).toBe(false);

    const { data: alterada } = await a.cliente
      .from("responsaveis")
      .update({ nome: "Rafa", updated_at: "2000-01-01T00:00:00Z" })
      .eq("id", data!.id)
      .select()
      .single();
    expect(alterada!.nome).toBe("Rafa");
    expect(new Date(alterada!.updated_at).getTime()).toBeGreaterThan(
      new Date(data!.updated_at).getTime(),
    );
  });

  it("não grava em nome de outro dono", async () => {
    const { error } = await a.cliente
      .from("responsaveis")
      .insert({ nome: "Intruso", cor: 2, ordem: 2, owner_id: b.id });
    expect(error?.code).toBe("42501");
  });

  it("outro usuário não lê, não altera e não apaga", async () => {
    const { data: deA } = await a.cliente.from("responsaveis").select("*");
    expect(deA!.length).toBeGreaterThan(0);
    const id = deA![0].id;

    const { data: lidos } = await b.cliente.from("responsaveis").select("*");
    expect(lidos).toEqual([]);

    const { data: alterados } = await b.cliente
      .from("responsaveis")
      .update({ nome: "Invadido" })
      .eq("id", id)
      .select();
    expect(alterados).toEqual([]);

    const { data: apagados } = await b.cliente.from("responsaveis").delete().eq("id", id).select();
    expect(apagados).toEqual([]);
    const { data: reordenados } = await b.cliente.rpc("reordenar_responsaveis", { ids: [id] });
    expect(reordenados).toEqual([]);

    const { data: depois } = await a.cliente.from("responsaveis").select("*").eq("id", id).single();
    expect(depois!.nome).not.toBe("Invadido");
  });

  it("recusa cor fora de 1..8, cor repetida e nome inválido", async () => {
    for (const cor of [0, 9]) {
      const { error } = await a.cliente.from("responsaveis").insert({ nome: `Cor ${cor}`, cor, ordem: 9 });
      expect(error?.code).toBe("23514");
    }
    const repetida = await a.cliente.from("responsaveis").insert({ nome: "Outro", cor: 1, ordem: 9 });
    expect(repetida.error?.code).toBe("23505");
    for (const nome of ["", " Rafael", "x".repeat(31)]) {
      const { error } = await a.cliente.from("responsaveis").insert({ nome, cor: 8, ordem: 9 });
      expect(error?.code).toBe("23514");
    }
    // O mesmo número de cor em outro dono é permitido.
    const { error } = await b.cliente.from("responsaveis").insert({ nome: "Rafael", cor: 1, ordem: 1 });
    expect(error).toBeNull();
  });

  it("reordenar grava numa transação e devolve só as linhas que mudaram", async () => {
    const { data: lucas } = await a.cliente
      .from("responsaveis")
      .insert({ nome: "Lucas", cor: 4, ordem: 2 })
      .select()
      .single();
    const { data: todos } = await a.cliente.from("responsaveis").select("*").order("ordem");
    const ids = todos!.map((r) => r.id).reverse();

    const { data, error } = await a.cliente.rpc("reordenar_responsaveis", { ids });
    expect(error).toBeNull();
    expect(data!.map((r) => r.id).sort()).toEqual([...ids].sort());
    expect(data!.find((r) => r.id === lucas!.id)!.ordem).toBe(1);

    const { data: deNovo } = await a.cliente.rpc("reordenar_responsaveis", { ids });
    expect(deNovo).toEqual([]);
  });

  it("o evento do Realtime chega a um segundo cliente do mesmo dono e não a outro dono", async () => {
    const outroAparelho = await entrar(a.email, a.senha);
    const { data: alvo } = await a.cliente.from("responsaveis").select("*").eq("nome", "Lucas").single();

    // Usuário B escuta a mesma tabela: não pode receber nada da linha de A.
    const eventosDeB: unknown[] = [];
    const canalB = b.cliente
      .channel("teste-responsaveis-b")
      .on("postgres_changes", { event: "*", schema: "public", table: "responsaveis" }, (payload) => {
        const nova = payload.new as { id?: string };
        const antiga = payload.old as { id?: string };
        if (nova?.id === alvo!.id || antiga?.id === alvo!.id) eventosDeB.push(payload);
      });
    await new Promise<void>((resolver, rejeitar) => {
      const limite = setTimeout(() => rejeitar(new Error("canal de B não conectou")), 15_000);
      canalB.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        clearTimeout(limite);
        resolver();
      });
    });

    // O Realtime pode levar um instante para ligar o postgres_changes depois
    // do SUBSCRIBED: grava de novo a cada 2 s (nome diferente a cada vez)
    // até o evento chegar, para o teste não depender de sorte no tempo.
    // Diagnóstico: o cliente de serviço ignora o RLS. Se ele recebe e o
    // usuário não, o problema é de autenticação/RLS; se nenhum recebe, é da
    // publicação ou do Realtime.
    const statusA: string[] = [];
    let eventosAdmin = 0;
    const canalAdmin = admin
      .channel("teste-responsaveis-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "responsaveis" }, () => {
        eventosAdmin++;
      })
      .subscribe();

    let repetidor: ReturnType<typeof setInterval> | undefined;
    const recebido = new Promise<{ id: string; nome: string; updated_at: string }>((resolver, rejeitar) => {
      const limite = setTimeout(() => {
        clearInterval(repetidor);
        rejeitar(
          new Error(
            `evento não chegou (status do canal: ${statusA.join(", ")}; eventos no cliente de serviço: ${eventosAdmin})`,
          ),
        );
      }, 25_000);
      const canal = outroAparelho
        .channel("teste-responsaveis")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "responsaveis" },
          (payload) => {
            const nova = payload.new as { id: string; nome: string; updated_at: string };
            if (nova.id !== alvo!.id || !nova.nome.startsWith("Lucas M")) return;
            clearTimeout(limite);
            clearInterval(repetidor);
            void outroAparelho.removeChannel(canal);
            resolver(nova);
          },
        )
        .subscribe((status, erro) => {
          statusA.push(erro ? `${status} (${erro.message})` : status);
          if (status !== "SUBSCRIBED" || repetidor) return;
          let tentativa = 0;
          const gravar = () =>
            void a.cliente
              .from("responsaveis")
              .update({ nome: `Lucas M${++tentativa}` })
              .eq("id", alvo!.id);
          gravar();
          repetidor = setInterval(gravar, 2_000);
        });
    });

    const nova = await recebido;
    expect(nova.nome).toMatch(/^Lucas M\d+$/);
    // Dá tempo de um eventual evento indevido chegar ao canal de B.
    await new Promise((r) => setTimeout(r, 1_000));

    // O `updated_at` do evento é o mesmo instante gravado no banco.
    const { data: lida } = await a.cliente.from("responsaveis").select("*").eq("id", alvo!.id).single();
    expect(Number.isNaN(instanteMicros(nova.updated_at))).toBe(false);
    if (lida!.nome === nova.nome) {
      expect(instanteMicros(nova.updated_at)).toBe(instanteMicros(lida!.updated_at));
    } else {
      // Uma regravação ainda em curso chegou depois do evento.
      expect(instanteMicros(lida!.updated_at)).toBeGreaterThan(instanteMicros(nova.updated_at));
    }

    expect(eventosDeB).toEqual([]);
    await b.cliente.removeChannel(canalB);
    await admin.removeChannel(canalAdmin);
  }, 40_000);
});
