import { describe, expect, it, vi } from "vitest";
import { bancoFalso, type Evento, type Linha, type OpcoesDoBancoFalso } from "../../test/banco-falso-de-push";
import { avisoDoLembrete, textoDoLembrete } from "@/domain/mensagens";
import { notificarLembretesDoDia, type ClienteDeNotificacoes } from "./notificar-lembretes";
import type { EnviarPush, ResultadoDoEnvio } from "./push";

// O aviso do sistema do Cron (História 7.5): lê com a chave de serviço, chama o núcleo e envia. Banco de mentira e
// envio injetado: nenhum teste fala com a rede nem usa chave VAPID de verdade.

const DONO = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";
const AGORA = new Date("2026-11-17T12:00:00Z"); // 09:00 em Brasília, 17/11/26: o primeiro dia de atraso do Lucas
const ENDPOINT_IPAD = "https://push.exemplo/ipad-segredo-do-endpoint";
const ENDPOINT_PC = "https://push.exemplo/pc-segredo-do-endpoint";

const bloco = (id: string, nome: string, responsavel: string, ordem = 1, dono = DONO): Linha => ({
  id,
  owner_id: dono,
  nome,
  ordem,
  de_cobranca: true,
  meu_bloco: false,
  formula: { tipo: "responsavel", id: responsavel },
});

const lancamento = (id: string, responsavel: string, extra: Linha = {}, dono = DONO): Linha => ({
  id,
  owner_id: dono,
  mes: "2026-11",
  excluido_em: null,
  valor_centavos: 11_516,
  responsavel_id: responsavel,
  tipo_id: "casa",
  status_id: "s-nao",
  lancado_por: "fatura",
  conta_manual_id: null,
  dividido_de_id: null,
  divisao: null,
  ajuste_de_id: null,
  vencimento_combinado: null,
  // Colunas que o Cron NÃO pode ler: o fake só devolve as pedidas no `select`.
  nome: "Mercado do Lucas",
  observacao: "obs particular",
  ...extra,
});

const inscricao = (id: string, endpoint: string, dono = DONO): Linha => ({
  id,
  owner_id: dono,
  endpoint,
  chave_p256dh: `p256dh-${id}`,
  chave_auth: `auth-${id}`,
});

/** O Lucas com R$ 115,16 atrasados desde 17/11/26, o iPad e o PC inscritos. */
function cenario(extra: Record<string, Linha[]> = {}): Record<string, Linha[]> {
  return {
    push_inscricoes: [inscricao("i-ipad", ENDPOINT_IPAD), inscricao("i-pc", ENDPOINT_PC)],
    lancamentos: [lancamento("l1", "lucas")],
    pagamento_itens: [],
    blocos: [bloco("b-lucas", "Lucas", "lucas")],
    status: [
      { id: "s-pago", owner_id: DONO, conta_como_pago: true },
      { id: "s-nao", owner_id: DONO, conta_como_pago: false },
    ],
    faturas: [
      { id: "f1", owner_id: DONO, mes: "2026-10", vencimento: "2026-10-06" },
      { id: "f2", owner_id: DONO, mes: "2026-11", vencimento: "2026-11-06" },
    ],
    config_ciclo: [
      { id: "c1", owner_id: DONO, dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2026-01", created_at: "2026-01-01T00:00:00Z" },
    ],
    configuracoes: [],
    lembretes_enviados: [],
    ...extra,
  };
}

/** Um envio falso que registra no mesmo `eventos` do banco (para provar a ordem) e responde o que o teste mandar. */
function envioFalso(eventos: Evento[], resposta: (endpoint: string) => ResultadoDoEnvio = () => ({ ok: true })) {
  const enviados: { endpoint: string; corpo: string }[] = [];
  const enviar = vi.fn<EnviarPush>(async (inscricao, corpo) => {
    eventos.push({ tipo: "envio" });
    enviados.push({ endpoint: inscricao.endpoint, corpo });
    return resposta(inscricao.endpoint);
  });
  return { enviar, enviados };
}

async function rodar(
  tabelas: Record<string, Linha[]>,
  resposta?: (endpoint: string) => ResultadoDoEnvio,
  opcoes: OpcoesDoBancoFalso = {},
  agora: Date = AGORA,
) {
  const banco = bancoFalso(tabelas, opcoes);
  const envio = envioFalso(banco.eventos, resposta);
  const resultado = await notificarLembretesDoDia(banco.cliente as unknown as ClienteDeNotificacoes, agora, envio.enviar);
  return { banco, resultado, ...envio };
}

const insercoes = (eventos: Evento[]) => eventos.filter((e) => e.tipo === "insercao");

describe("notificarLembretesDoDia: o que roda e o que pula", () => {
  it("sem as chaves VAPID (sem envio): pula e não toca no banco", async () => {
    const banco = bancoFalso(cenario());
    const r = await notificarLembretesDoDia(banco.cliente as unknown as ClienteDeNotificacoes, AGORA, null);
    expect(r).toEqual({ pulou: "sem_chaves", enviadas: 0, ignoradas: 0, inscricoesApagadas: 0, falhas: 0 });
    expect(banco.eventos).toEqual([]);
  });

  it("sem nenhuma inscrição: pula e NÃO grava em lembretes_enviados (o aviso do dia não fica gasto)", async () => {
    const { resultado, banco, enviados } = await rodar(cenario({ push_inscricoes: [] }));
    expect(resultado.pulou).toBe("sem_inscricao");
    expect(insercoes(banco.eventos)).toEqual([]);
    expect(enviados).toEqual([]);
    expect(banco.dados.lembretes_enviados).toEqual([]);
    // Quem ativa as notificações à tarde ainda recebe o aviso do dia, na próxima execução.
    banco.dados.push_inscricoes = [inscricao("i-novo", ENDPOINT_IPAD)];
    const depois = envioFalso(banco.eventos);
    const r = await notificarLembretesDoDia(banco.cliente as unknown as ClienteDeNotificacoes, AGORA, depois.enviar);
    expect(r).toMatchObject({ pulou: null, enviadas: 1 });
  });

  it("a migração ainda não entrou (push_inscricoes não existe): pula como 'sem tabela' e não lança", async () => {
    const { resultado, enviados } = await rodar(cenario(), undefined, { semTabela: ["push_inscricoes"] });
    expect(resultado).toMatchObject({ pulou: "sem_tabela", enviadas: 0 });
    expect(enviados).toEqual([]);
  });

  it("lembretes_enviados ainda não existe: o dono é pulado (falha contada), nada é enviado", async () => {
    const { resultado, enviados } = await rodar(cenario(), undefined, { semTabela: ["lembretes_enviados"] });
    expect(resultado).toMatchObject({ pulou: null, enviadas: 0, falhas: 1 });
    expect(enviados).toEqual([]);
  });

  it("a leitura das inscrições falha: pula como 'leitura falhou'", async () => {
    const { resultado } = await rodar(cenario(), undefined, { leituraFalha: ["push_inscricoes"] });
    expect(resultado.pulou).toBe("leitura_falhou");
  });

  it("a leitura dos dados do dono falha: ninguém é avisado e a falha é contada", async () => {
    const { resultado, enviados, banco } = await rodar(cenario(), undefined, { leituraFalha: ["lancamentos"] });
    expect(resultado).toMatchObject({ pulou: null, enviadas: 0, falhas: 1 });
    expect(enviados).toEqual([]);
    expect(insercoes(banco.eventos)).toEqual([]);
  });

  it("nada a avisar (ninguém atrasado, nenhuma fatura fechando): lê, não grava e não envia", async () => {
    const { resultado, enviados, banco } = await rodar(cenario({ lancamentos: [] }));
    expect(resultado).toEqual({ pulou: null, enviadas: 0, ignoradas: 0, inscricoesApagadas: 0, falhas: 0 });
    expect(enviados).toEqual([]);
    expect(insercoes(banco.eventos)).toEqual([]);
  });
});

describe("notificarLembretesDoDia: inserir antes de enviar", () => {
  it("o atraso do Lucas: insere (atraso, Bloco, desde) ANTES do primeiro envio e envia o texto do aviso a cada aparelho", async () => {
    const { resultado, banco, enviados } = await rodar(cenario());
    expect(resultado).toEqual({ pulou: null, enviadas: 1, ignoradas: 0, inscricoesApagadas: 0, falhas: 0 });

    const sequencia = banco.eventos.filter((e) => e.tipo === "insercao" || e.tipo === "envio").map((e) => e.tipo);
    expect(sequencia).toEqual(["insercao", "envio", "envio"]);
    expect(insercoes(banco.eventos)[0]).toMatchObject({
      tabela: "lembretes_enviados",
      linha: { owner_id: DONO, tipo: "atraso", referencia: "b-lucas", dia: "2026-11-17" },
    });

    expect(enviados.map((e) => e.endpoint)).toEqual([ENDPOINT_IPAD, ENDPOINT_PC]);
    const aviso = JSON.parse(enviados[0].corpo);
    expect(aviso).toEqual({
      titulo: "Conta Comigo",
      corpo: expect.stringMatching(/^Lucas: R\$\s115,16 em atraso desde 17\/11\/26$/),
      destino: "/recebimentos",
      tag: "atraso:b-lucas",
    });
  });

  it("o corpo enviado é o texto do lembrete da Central (uma fonte só), e leva o destino para o toque", async () => {
    const { enviados } = await rodar(cenario());
    const aviso = JSON.parse(enviados[0].corpo);
    const lembrete = {
      tipo: "atraso",
      referencia: "b-lucas",
      blocoId: "b-lucas",
      blocoNome: "Lucas",
      valorCentavos: 11_516,
      desde: "2026-11-17",
      destino: "/recebimentos",
    } as const;
    expect(aviso).toEqual(avisoDoLembrete(lembrete));
    expect(aviso.corpo).toBe(textoDoLembrete(lembrete));
  });

  it("o fechamento: no dia 28/10 sem Fatura de novembro, o aviso abre o Painel do Mês da Fatura", async () => {
    const { enviados, banco } = await rodar(
      cenario({ lancamentos: [], faturas: [{ id: "f1", owner_id: DONO, mes: "2026-10", vencimento: "2026-10-06" }] }),
      undefined,
      {},
      new Date("2026-10-28T12:00:00Z"),
    );
    expect(insercoes(banco.eventos)[0]).toMatchObject({
      linha: { tipo: "fechamento", referencia: "2026-11", dia: "2026-10-28" },
    });
    expect(JSON.parse(enviados[0].corpo)).toMatchObject({
      corpo: "A fatura de novembro fechou. Importe o PDF quando chegar",
      destino: "/?mes=2026-11",
    });
  });

  it("Cron que falhou no dia do fechamento: dois dias depois avisa, com a chave do dia do fechamento, e só uma vez", async () => {
    const tabelas = cenario({
      lancamentos: [],
      faturas: [{ id: "f1", owner_id: DONO, mes: "2026-10", vencimento: "2026-10-06" }],
    });
    const banco = bancoFalso(tabelas);
    const cliente = banco.cliente as unknown as ClienteDeNotificacoes;
    const envio = envioFalso(banco.eventos);
    const dois = await notificarLembretesDoDia(cliente, new Date("2026-10-30T12:00:00Z"), envio.enviar);
    expect(dois.enviadas).toBe(1);
    expect(banco.dados.lembretes_enviados).toMatchObject([{ tipo: "fechamento", referencia: "2026-11", dia: "2026-10-28" }]);
    const tres = await notificarLembretesDoDia(cliente, new Date("2026-10-31T12:00:00Z"), envio.enviar);
    expect(tres.enviadas).toBe(0);
    expect(envio.enviados).toHaveLength(2); // dois aparelhos, uma única vez
  });

  it("duas execuções no mesmo dia: a segunda não insere nem envia (a chave já está em lembretes_enviados)", async () => {
    const banco = bancoFalso(cenario());
    const cliente = banco.cliente as unknown as ClienteDeNotificacoes;
    const envio = envioFalso(banco.eventos);
    expect((await notificarLembretesDoDia(cliente, AGORA, envio.enviar)).enviadas).toBe(1);
    const segunda = await notificarLembretesDoDia(cliente, AGORA, envio.enviar);
    expect(segunda).toEqual({ pulou: null, enviadas: 0, ignoradas: 0, inscricoesApagadas: 0, falhas: 0 });
    expect(envio.enviados).toHaveLength(2);
    expect(insercoes(banco.eventos)).toHaveLength(1);
  });

  it("o atraso que continua no dia seguinte não repete", async () => {
    const banco = bancoFalso(cenario());
    const cliente = banco.cliente as unknown as ClienteDeNotificacoes;
    const envio = envioFalso(banco.eventos);
    await notificarLembretesDoDia(cliente, AGORA, envio.enviar);
    const dia18 = await notificarLembretesDoDia(cliente, new Date("2026-11-18T12:00:00Z"), envio.enviar);
    expect(dia18.enviadas).toBe(0);
    expect(envio.enviados).toHaveLength(2);
  });

  it("duas execuções ao mesmo tempo: a que perde a corrida na restrição única (23505) não envia", async () => {
    // Outra execução inseriu a chave entre a leitura e a nossa inserção.
    const banco = bancoFalso(cenario());
    const cliente = {
      from: (tabela: string) => ({
        ...banco.cliente.from(tabela),
        insert: (linha: Linha) => {
          if (tabela === "lembretes_enviados") banco.dados.lembretes_enviados.push({ id: "da-outra-execucao", ...linha });
          return banco.cliente.from(tabela).insert(linha);
        },
      }),
    };
    const envio = envioFalso(banco.eventos);
    const r = await notificarLembretesDoDia(cliente as unknown as ClienteDeNotificacoes, AGORA, envio.enviar);
    expect(r).toMatchObject({ enviadas: 0, ignoradas: 1, falhas: 0 });
    expect(envio.enviados).toEqual([]);
  });

  it("a inserção falha por outro erro: não envia e conta a falha", async () => {
    const { resultado, enviados } = await rodar(cenario(), undefined, { erroDaInsercao: { code: "XX000" } });
    expect(resultado).toMatchObject({ enviadas: 0, ignoradas: 0, falhas: 1 });
    expect(enviados).toEqual([]);
  });

  it("a inserção lança (rede): não envia, conta a falha e não lança", async () => {
    const { resultado, enviados } = await rodar(cenario(), undefined, { insercaoLanca: true });
    expect(resultado).toMatchObject({ enviadas: 0, falhas: 1 });
    expect(enviados).toEqual([]);
  });

  it("preferência de atraso desligada em configuracoes: nada é inserido nem enviado", async () => {
    const { resultado, enviados, banco } = await rodar(
      cenario({ configuracoes: [{ id: "cfg", owner_id: DONO, lembrete_fechamento: true, lembrete_atraso: false, tolerancia_atraso_dias: 10 }] }),
    );
    expect(resultado.enviadas).toBe(0);
    expect(enviados).toEqual([]);
    expect(insercoes(banco.eventos)).toEqual([]);
  });

  it("a tolerância do dono vale (tolerância 20: ainda em dia em 17/11)", async () => {
    const { enviados } = await rodar(
      cenario({ configuracoes: [{ id: "cfg", owner_id: DONO, lembrete_fechamento: true, lembrete_atraso: true, tolerancia_atraso_dias: 20 }] }),
    );
    expect(enviados).toEqual([]);
  });

  it("sem limite (8.1): 5 Blocos atrasados são 5 avisos, cada chave inserida antes do envio", async () => {
    const nomes = ["Ana", "Beto", "Caio", "Duda", "Eva"];
    const { resultado, banco } = await rodar(
      cenario({
        blocos: nomes.map((n, i) => bloco(`b-${n}`, n, n.toLowerCase(), i + 1)),
        lancamentos: nomes.map((n, i) => lancamento(`l${i}`, n.toLowerCase())),
      }),
    );
    expect(resultado.enviadas).toBe(5);
    expect(insercoes(banco.eventos).map((e) => (e as { linha: Linha }).linha.referencia)).toEqual([
      "b-Ana",
      "b-Beto",
      "b-Caio",
      "b-Duda",
      "b-Eva",
    ]);
  });

  it("os já avisados não saem de novo: só o 4º e o 5º Bloco (a rajada acontece uma vez)", async () => {
    const nomes = ["Ana", "Beto", "Caio", "Duda", "Eva"];
    const { resultado, banco } = await rodar(
      cenario({
        blocos: nomes.map((n, i) => bloco(`b-${n}`, n, n.toLowerCase(), i + 1)),
        lancamentos: nomes.map((n, i) => lancamento(`l${i}`, n.toLowerCase())),
        lembretes_enviados: ["Ana", "Beto", "Caio"].map((n) => ({
          id: `e-${n}`,
          owner_id: DONO,
          tipo: "atraso",
          referencia: `b-${n}`,
          dia: "2026-11-17",
        })),
      }),
    );
    expect(resultado.enviadas).toBe(2);
    expect(insercoes(banco.eventos).map((e) => (e as { linha: Linha }).linha.referencia)).toEqual(["b-Duda", "b-Eva"]);
  });
});

describe("notificarLembretesDoDia: o que o serviço de push responde", () => {
  it.each([404, 410])("%i: apaga a inscrição recusada e segue com a outra", async (status) => {
    const { resultado, banco, enviados } = await rodar(cenario(), (endpoint) =>
      endpoint === ENDPOINT_IPAD ? { ok: false, status } : { ok: true },
    );
    expect(resultado).toEqual({ pulou: null, enviadas: 1, ignoradas: 0, inscricoesApagadas: 1, falhas: 0 });
    expect(enviados.map((e) => e.endpoint)).toEqual([ENDPOINT_IPAD, ENDPOINT_PC]);
    expect(banco.dados.push_inscricoes.map((i) => i.id)).toEqual(["i-pc"]);
    expect(banco.eventos.filter((e) => e.tipo === "delete")).toEqual([
      { tipo: "delete", tabela: "push_inscricoes", filtros: [["id", "i-ipad"]] },
    ]);
  });

  it("outros erros (500, 401, rede): NÃO apaga, conta a falha e a linha de lembretes_enviados continua (nunca duas vezes)", async () => {
    for (const status of [500, 401, 403, null]) {
      const { resultado, banco } = await rodar(cenario(), () => ({ ok: false, status }));
      expect(resultado).toEqual({ pulou: null, enviadas: 0, ignoradas: 0, inscricoesApagadas: 0, falhas: 2 });
      expect(banco.dados.push_inscricoes).toHaveLength(2);
      expect(banco.dados.lembretes_enviados).toHaveLength(1);
    }
  });

  it("um aparelho aceita e o outro falha por erro qualquer: conta como enviado e como falha", async () => {
    const { resultado } = await rodar(cenario(), (endpoint) => (endpoint === ENDPOINT_PC ? { ok: false, status: 503 } : { ok: true }));
    expect(resultado).toMatchObject({ enviadas: 1, falhas: 1, inscricoesApagadas: 0 });
  });

  it("o envio lança (nunca deveria): vira falha e o próximo aparelho ainda recebe", async () => {
    const banco = bancoFalso(cenario());
    const enviar = vi.fn<EnviarPush>(async (inscricao) => {
      if (inscricao.endpoint === ENDPOINT_IPAD) throw new Error(`explodiu ${ENDPOINT_IPAD}`);
      return { ok: true };
    });
    const r = await notificarLembretesDoDia(banco.cliente as unknown as ClienteDeNotificacoes, AGORA, enviar);
    expect(r).toMatchObject({ enviadas: 1, falhas: 1 });
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it("todas as inscrições acabaram (410): apaga as duas e os próximos lembretes nem são inseridos", async () => {
    const { resultado, banco } = await rodar(
      cenario({
        blocos: [bloco("b-lucas", "Lucas", "lucas", 1), bloco("b-rangel", "Rangel", "rangel", 2)],
        lancamentos: [lancamento("l1", "lucas"), lancamento("l2", "rangel")],
      }),
      () => ({ ok: false, status: 410 }),
    );
    expect(resultado).toEqual({ pulou: null, enviadas: 0, ignoradas: 0, inscricoesApagadas: 2, falhas: 0 });
    expect(banco.dados.push_inscricoes).toEqual([]);
    // O primeiro lembrete foi inserido (e perdeu os aparelhos); o segundo, sem aparelho, não grava nada.
    expect(insercoes(banco.eventos)).toHaveLength(1);
  });

  it("o delete da inscrição falha: conta a falha, não lança", async () => {
    const { resultado } = await rodar(cenario(), (e) => (e === ENDPOINT_IPAD ? { ok: false, status: 410 } : { ok: true }), {
      erroDoDelete: true,
    });
    expect(resultado).toMatchObject({ enviadas: 1, inscricoesApagadas: 0, falhas: 1 });
  });
});

describe("notificarLembretesDoDia: de quem são as linhas", () => {
  it("cada dono recebe só o dele: lê com o filtro de dono e envia só para os aparelhos dele", async () => {
    const { resultado, banco, enviados } = await rodar(
      cenario({
        push_inscricoes: [inscricao("i-a", ENDPOINT_IPAD, DONO), inscricao("i-b", ENDPOINT_PC, OUTRO)],
        // O Lucas do OUTRO dono também deve; o do DONO não tem nada atrasado.
        lancamentos: [lancamento("l-outro", "lucas", {}, OUTRO)],
        blocos: [bloco("b-lucas-outro", "Lucas", "lucas", 1, OUTRO)],
        status: [{ id: "s-nao", owner_id: OUTRO, conta_como_pago: false }, { id: "s-pago", owner_id: OUTRO, conta_como_pago: true }],
        faturas: [{ id: "f1", owner_id: OUTRO, mes: "2026-11", vencimento: "2026-11-06" }],
        config_ciclo: [
          { id: "c1", owner_id: OUTRO, dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2026-01", created_at: "2026-01-01T00:00:00Z" },
        ],
      }),
    );
    expect(resultado.enviadas).toBe(1);
    expect(enviados.map((e) => e.endpoint)).toEqual([ENDPOINT_PC]);
    expect(insercoes(banco.eventos).map((e) => (e as { linha: Linha }).linha.owner_id)).toEqual([OUTRO]);
    for (const e of banco.eventos) {
      if (e.tipo === "leitura" && e.tabela !== "push_inscricoes") expect(e.filtros).toContainEqual(["owner_id", expect.any(String)]);
    }
  });
});

describe("notificarLembretesDoDia: o que é lido", () => {
  it("nunca lê o Nome nem a Observação dos Lançamentos (só as colunas que o núcleo usa)", async () => {
    const { banco } = await rodar(cenario());
    const leituras = banco.eventos.filter((e): e is Extract<Evento, { tipo: "leitura" }> => e.tipo === "leitura");
    // Nenhuma tabela, menos `blocos`, lê `nome`, `observacao`, `nome_normalizado` ou `apelido`.
    const dasOutras = leituras.filter((l) => l.tabela !== "blocos").map((l) => l.colunas).join(" | ");
    expect(dasOutras).not.toMatch(/\bnome\b|observacao|nome_normalizado|apelido/);
    // A exceção é o `nome` do Bloco: é o texto do aviso ("O Lucas tem ...") e a faixa também o mostra.
    expect(leituras.find((l) => l.tabela === "blocos")!.colunas).toContain("nome");
  });

  it("lê só os itens de Pagamento vivos e só os Blocos de cobrança", async () => {
    const { banco } = await rodar(cenario());
    const filtros = (tabela: string) =>
      banco.eventos.filter((e): e is Extract<Evento, { tipo: "leitura" }> => e.tipo === "leitura" && e.tabela === tabela)[0].filtros;
    expect(filtros("pagamento_itens")).toContainEqual(["excluido_em", null]);
    expect(filtros("blocos")).toContainEqual(["de_cobranca", true]);
  });

  it("lê por páginas de 1000 (mais de 1000 Lançamentos não são cortados)", async () => {
    // 2.100 Lançamentos de outro Responsável, e o do Lucas por último.
    const muitos = Array.from({ length: 2_100 }, (_, i) => lancamento(`m${i}`, "ninguem", { status_id: "s-pago" }));
    const { banco, resultado } = await rodar(cenario({ lancamentos: [...muitos, lancamento("l-lucas", "lucas")] }));
    expect(resultado.enviadas).toBe(1);
    const paginas = banco.eventos.filter((e) => e.tipo === "leitura" && e.tabela === "lancamentos");
    expect(paginas.map((p) => (p as { faixa: [number, number] }).faixa)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });
});

describe("notificarLembretesDoDia: tempo", () => {
  it("passado o prazo, nenhum aviso novo começa (nada é inserido; sai no próximo dia)", async () => {
    const banco = bancoFalso(cenario());
    const envio = envioFalso(banco.eventos);
    const r = await notificarLembretesDoDia(banco.cliente as unknown as ClienteDeNotificacoes, AGORA, envio.enviar, Date.now() - 1);
    expect(r).toMatchObject({ pulou: null, enviadas: 0 });
    expect(insercoes(banco.eventos)).toEqual([]);
    expect(envio.enviados).toEqual([]);
  });
});

describe("notificarLembretesDoDia: nada sensível no resultado", () => {
  it("o resultado só tem contagens e o motivo: nunca endpoint, chave, texto, nome ou valor", async () => {
    const { resultado } = await rodar(cenario(), () => ({ ok: false, status: 410 }), { erroDoDelete: true });
    const texto = JSON.stringify(resultado);
    for (const proibido of [ENDPOINT_IPAD, ENDPOINT_PC, "Lucas", "115", "auth-i-", "p256dh", DONO, "segredo"]) {
      expect(texto).not.toContain(proibido);
    }
    expect(Object.keys(resultado).sort()).toEqual(["enviadas", "falhas", "ignoradas", "inscricoesApagadas", "pulou"]);
  });
});
