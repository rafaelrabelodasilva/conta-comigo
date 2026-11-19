// Prova, contra o Supabase local (CI), a migração da História 7.5 (`20261202120000_notificacoes_push.sql`):
// `push_inscricoes` (a inscrição Web Push de cada aparelho: RLS por dono, `endpoint` único, formato conferido) e
// `lembretes_enviados` (só a chave de serviço: a restrição única que impede o mesmo aviso de sair duas vezes e a
// recusa a quem é do navegador). Roda também o aviso do Cron de verdade (`notificarLembretesDoDia`) contra o banco,
// com o envio injetado: a chave entra ANTES do envio, a segunda execução não repete e o 410 apaga a inscrição.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fechamentoDoMes, mesDaData, somarMeses } from "../../src/domain/ciclo";
import { hojeEmSaoPaulo } from "../../src/domain/datas";
import { notificarLembretesDoDia, type ClienteDeNotificacoes } from "../../src/server/notificar-lembretes";
import type { EnviarPush } from "../../src/server/push";
import { ligado, supabaseLocal, type Usuario } from "./apoio";

describe.skipIf(!ligado)("Notificações do sistema no Supabase local (História 7.5)", () => {
  let local: ReturnType<typeof supabaseLocal>;
  let a: Usuario;
  let b: Usuario;
  let seq = 0;
  const mesAtual = mesDaData(hojeEmSaoPaulo(new Date()));

  const nova = (prefixo = "ipad") => ({
    endpoint: `https://push.exemplo/${prefixo}-${Date.now()}-${++seq}`,
    chave_p256dh: "BPubKeyDeTeste",
    chave_auth: "authDeTeste",
  });

  beforeAll(async () => {
    local = supabaseLocal("push");
    a = await local.criarUsuario("a");
    b = await local.criarUsuario("b");
  });

  afterAll(async () => {
    await local.limpar();
  });

  describe("push_inscricoes", () => {
    it("o dono grava a inscrição do aparelho (owner_id e updated_at vêm do banco) e lê só as dele", async () => {
      const inscricao = nova();
      const { error } = await a.cliente.from("push_inscricoes").insert(inscricao);
      expect(error).toBeNull();
      const { data } = await a.cliente.from("push_inscricoes").select().eq("endpoint", inscricao.endpoint);
      expect(data).toHaveLength(1);
      expect(data![0]).toMatchObject({ owner_id: a.id, ...inscricao });
      expect(new Date(data![0].created_at).getFullYear()).toBeGreaterThan(2000);
    });

    it("o upsert pelo endpoint (o 'Ativar notificações' de novo) atualiza a mesma linha, sem duplicar", async () => {
      const inscricao = nova();
      await a.cliente.from("push_inscricoes").upsert(inscricao, { onConflict: "endpoint" });
      const { error } = await a.cliente
        .from("push_inscricoes")
        .upsert({ ...inscricao, chave_auth: "authNovo" }, { onConflict: "endpoint" });
      expect(error).toBeNull();
      const { data } = await a.cliente.from("push_inscricoes").select().eq("endpoint", inscricao.endpoint);
      expect(data).toHaveLength(1);
      expect(data![0].chave_auth).toBe("authNovo");
    });

    it("iPad e PC convivem: dois endpoints, duas linhas", async () => {
      const { error } = await a.cliente.from("push_inscricoes").insert([nova("ipad"), nova("pc")]);
      expect(error).toBeNull();
    });

    it("outro dono não vê, não muda e não apaga a inscrição de A", async () => {
      const inscricao = nova();
      await a.cliente.from("push_inscricoes").insert(inscricao);

      const vistas = await b.cliente.from("push_inscricoes").select().eq("endpoint", inscricao.endpoint);
      expect(vistas.data).toEqual([]);

      await b.cliente.from("push_inscricoes").update({ chave_auth: "invadida" }).eq("endpoint", inscricao.endpoint);
      await b.cliente.from("push_inscricoes").delete().eq("endpoint", inscricao.endpoint);
      const { data } = await local.admin.from("push_inscricoes").select().eq("endpoint", inscricao.endpoint);
      expect(data).toHaveLength(1);
      expect(data![0].chave_auth).toBe("authDeTeste");
    });

    it("não dá para gravar em nome de outro dono, nem tomar o endpoint dele por upsert", async () => {
      const inscricao = nova();
      const emNomeDeA = await b.cliente.from("push_inscricoes").insert({ ...inscricao, owner_id: a.id });
      expect(emNomeDeA.error).not.toBeNull();

      await a.cliente.from("push_inscricoes").insert(inscricao);
      const roubo = await b.cliente
        .from("push_inscricoes")
        .upsert({ ...inscricao, chave_auth: "roubada" }, { onConflict: "endpoint" });
      expect(roubo.error).not.toBeNull();
      const { data } = await local.admin.from("push_inscricoes").select().eq("endpoint", inscricao.endpoint);
      expect(data).toHaveLength(1);
      expect(data![0].owner_id).toBe(a.id);
    });

    it("'Desativar neste aparelho': o dono apaga só a do endpoint dele", async () => {
      const [ipad, pc] = [nova("ipad"), nova("pc")];
      await a.cliente.from("push_inscricoes").insert([ipad, pc]);
      const { error } = await a.cliente.from("push_inscricoes").delete().eq("endpoint", ipad.endpoint);
      expect(error).toBeNull();
      const { data } = await a.cliente.from("push_inscricoes").select().in("endpoint", [ipad.endpoint, pc.endpoint]);
      expect(data!.map((l) => l.endpoint)).toEqual([pc.endpoint]);
    });

    it("o anônimo não lê nem grava", async () => {
      const lido = await local.anonimo.from("push_inscricoes").select();
      expect(lido.data ?? []).toEqual([]);
      const gravado = await local.anonimo.from("push_inscricoes").insert(nova());
      expect(gravado.error).not.toBeNull();
    });

    it.each([
      ["endpoint que não é https", { endpoint: "http://push.exemplo/x" }],
      ["endpoint com espaço", { endpoint: "https://push.exemplo/a b" }],
      ["endpoint longo demais", { endpoint: `https://push.exemplo/${"x".repeat(2050)}` }],
      ["p256dh vazia", { chave_p256dh: "" }],
      ["auth vazia", { chave_auth: "" }],
    ])("recusa: %s", async (_nome, extra) => {
      const { error } = await a.cliente.from("push_inscricoes").insert({ ...nova(), ...extra });
      expect(error).not.toBeNull();
    });
  });

  describe("lembretes_enviados (só a chave de serviço)", () => {
    const chave = (extra: object = {}) => ({
      owner_id: a.id,
      tipo: "atraso",
      referencia: `bloco-${Date.now()}-${++seq}`,
      dia: "2026-11-17",
      ...extra,
    });

    it("a chave de serviço insere; a mesma (dono, tipo, referência, dia) de novo é recusada com 23505", async () => {
      const linha = chave();
      expect((await local.admin.from("lembretes_enviados").insert(linha)).error).toBeNull();
      const repetida = await local.admin.from("lembretes_enviados").insert(linha);
      expect(repetida.error?.code).toBe("23505");
    });

    it("outro dia, outra referência, outro tipo ou outro dono são outra chave", async () => {
      const base = chave({ tipo: "fechamento", referencia: `2026-${String(++seq).padStart(2, "0")}`, dia: "2026-10-28" });
      await local.admin.from("lembretes_enviados").insert(base);
      for (const extra of [{ dia: "2026-10-29" }, { referencia: `${base.referencia}-x` }, { tipo: "atraso" }, { owner_id: b.id }]) {
        const { error } = await local.admin.from("lembretes_enviados").insert({ ...base, ...extra });
        expect(error).toBeNull();
      }
    });

    it("recusa tipo desconhecido, referência vazia e dia inválido", async () => {
      for (const extra of [{ tipo: "outro" }, { referencia: "" }, { referencia: "x".repeat(65) }]) {
        expect((await local.admin.from("lembretes_enviados").insert(chave(extra))).error).not.toBeNull();
      }
    });

    it("o dono logado NÃO lê, NÃO insere, NÃO atualiza e NÃO apaga (nenhum privilégio para o navegador)", async () => {
      const linha = chave();
      await local.admin.from("lembretes_enviados").insert(linha);
      const lido = await a.cliente.from("lembretes_enviados").select();
      expect(lido.error).not.toBeNull();
      expect((await a.cliente.from("lembretes_enviados").insert(chave())).error).not.toBeNull();
      expect((await a.cliente.from("lembretes_enviados").update({ dia: "2026-01-01" }).eq("referencia", linha.referencia)).error).not.toBeNull();
      expect((await a.cliente.from("lembretes_enviados").delete().eq("referencia", linha.referencia)).error).not.toBeNull();
      const { data } = await local.admin.from("lembretes_enviados").select().eq("referencia", linha.referencia);
      expect(data).toHaveLength(1);
    });

    it("o anônimo também não", async () => {
      expect((await local.anonimo.from("lembretes_enviados").select()).error).not.toBeNull();
      expect((await local.anonimo.from("lembretes_enviados").insert(chave())).error).not.toBeNull();
    });
  });

  describe("o aviso do Cron contra o banco de verdade", () => {
    // O Ciclo fecha dia 28 e vence dia 06, vigente desde o mês corrente. A Fatura do mês seguinte fecha no dia 28
    // do mês corrente: é o dia do lembrete de fechamento (sem nenhuma Fatura importada).
    const mesDaFatura = somarMeses(mesAtual, 1);
    const hoje = fechamentoDoMes(mesDaFatura, { dia_fechamento: 28, dia_vencimento: 6 });
    const agora = new Date(`${hoje}T12:00:00Z`);

    let ipad: string;
    let pc: string;

    beforeAll(async () => {
      // O dono A já tem chaves dos testes de cima: aqui só vale o que o Cron gravar.
      await local.admin.from("lembretes_enviados").delete().eq("owner_id", a.id);
      const ciclo = await a.cliente.from("config_ciclo").insert({ dia_fechamento: 28, dia_vencimento: 6, vigente_desde: mesAtual });
      expect(ciclo.error).toBeNull();
      ipad = nova("cron-ipad").endpoint;
      pc = nova("cron-pc").endpoint;
      expect((await a.cliente.from("push_inscricoes").insert([
        { endpoint: ipad, chave_p256dh: "p-ipad", chave_auth: "a-ipad" },
        { endpoint: pc, chave_p256dh: "p-pc", chave_auth: "a-pc" },
      ])).error).toBeNull();
    });

    const cliente = () => local.admin as unknown as ClienteDeNotificacoes;
    const minhas = async () => (await local.admin.from("lembretes_enviados").select().eq("owner_id", a.id)).data ?? [];

    it("insere a chave do fechamento ANTES de enviar, avisa os dois aparelhos e não repete na segunda execução", async () => {
      const visto: { chaveJaGravada: boolean; endpoint: string; corpo: string }[] = [];
      const enviar = vi.fn<EnviarPush>(async (inscricao, corpo) => {
        visto.push({ chaveJaGravada: (await minhas()).length > 0, endpoint: inscricao.endpoint, corpo });
        return { ok: true };
      });

      const primeira = await notificarLembretesDoDia(cliente(), agora, enviar);
      expect(primeira).toMatchObject({ pulou: null, enviadas: 1, ignoradas: 0, inscricoesApagadas: 0, falhas: 0 });
      expect(visto.every((v) => v.chaveJaGravada)).toBe(true);
      // Os dois aparelhos deste teste recebem (o dono tem outros, de testes anteriores).
      expect(visto.map((v) => v.endpoint)).toEqual(expect.arrayContaining([ipad, pc]));
      expect(JSON.parse(visto[0].corpo)).toMatchObject({ destino: `/?mes=${mesDaFatura}`, tag: `fechamento:${mesDaFatura}` });
      expect(await minhas()).toMatchObject([{ tipo: "fechamento", referencia: mesDaFatura, dia: hoje }]);

      const segunda = await notificarLembretesDoDia(cliente(), agora, enviar);
      expect(segunda).toMatchObject({ pulou: null, enviadas: 0 });
      expect(await minhas()).toHaveLength(1);
      expect(vi.mocked(enviar).mock.calls.length).toBe(visto.length);
    });

    it("o dono B (sem inscrição) não recebe nada e nada dele é gravado", async () => {
      const { data } = await local.admin.from("lembretes_enviados").select().eq("owner_id", b.id);
      expect(data).toEqual([]);
    });

    it("410 do serviço de push apaga a inscrição recusada no banco e deixa a outra", async () => {
      // Outro dia da janela do fechamento, para haver um aviso novo: o Cron falhou no dia e voltou. A chave é a mesma
      // (o dia do fechamento), então ela já existe: apague-a para simular o aviso ainda não enviado.
      await local.admin.from("lembretes_enviados").delete().eq("owner_id", a.id);
      const enviar = vi.fn<EnviarPush>(async (inscricao) =>
        inscricao.endpoint === ipad ? { ok: false, status: 410 } : { ok: true },
      );
      const r = await notificarLembretesDoDia(cliente(), new Date(`${hoje}T12:00:00Z`), enviar);
      expect(r).toMatchObject({ enviadas: 1, inscricoesApagadas: 1, falhas: 0 });
      const { data } = await local.admin.from("push_inscricoes").select("endpoint").eq("owner_id", a.id).in("endpoint", [ipad, pc]);
      expect(data!.map((l) => l.endpoint)).toEqual([pc]);
    });
  });
});
