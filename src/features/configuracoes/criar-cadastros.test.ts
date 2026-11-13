import { describe, expect, it, vi } from "vitest";
import type { PlanoDeCadastros } from "@/domain/importacao-planilha";
import type { Responsavel } from "@/domain/responsaveis";
import { cabemOsResponsaveis, criarCadastrosDaPlanilha, type PortasDeCadastro } from "./criar-cadastros";

const OK = { ok: true } as const;
const resp = (n: number, extra: Partial<Responsavel> = {}): Responsavel => ({ id: `r${n}`, nome: `R${n}`, cor: n, ordem: n, arquivado: false, ...extra });

function portas(extra: { responsaveis?: Responsavel[]; status?: { id: string; nome: string }[] } = {}) {
  const chamadas: string[] = [];
  const p: PortasDeCadastro = {
    responsaveis: {
      criar: vi.fn(async (n) => (chamadas.push(`criar R ${n.nome} cor ${n.cor} ordem ${n.ordem}`), OK)),
      desarquivar: vi.fn(async (id, ordem) => (chamadas.push(`reativar R ${id} ordem ${ordem}`), OK)),
    },
    tipos: {
      criar: vi.fn(async (n) => (chamadas.push(`criar T ${n.nome}`), OK)),
      desarquivar: vi.fn(async (id) => (chamadas.push(`reativar T ${id}`), OK)),
    },
    status: {
      criar: vi.fn(async (n) => (chamadas.push(`criar S ${n.nome}`), OK)),
      desarquivar: vi.fn(async (id) => (chamadas.push(`reativar S ${id}`), OK)),
      definirContaComoPago: vi.fn(async (id, v) => (chamadas.push(`pago ${id} ${v}`), OK)),
    },
    ler: async () => ({ ok: true, responsaveis: extra.responsaveis ?? [resp(1)], status: extra.status ?? [{ id: "s9", nome: "Pago" }] }),
  };
  return { p, chamadas };
}

const PLANO: PlanoDeCadastros = {
  criar: { responsaveis: ["Mãe", "Casal"], tipos: ["Casa"], status: [{ nome: "Pago", conta_como_pago: true }, { nome: "Pendente", conta_como_pago: false }] },
  reativar: { responsaveis: ["r2"], tipos: ["t7"], status: ["s7"] },
};

describe("criarCadastrosDaPlanilha", () => {
  it("reativa e cria, com a próxima cor e ordem do núcleo, e marca 'Pago' como conta como pago", async () => {
    const { p, chamadas } = portas({ responsaveis: [resp(1), resp(2, { arquivado: true })] });
    const r = await criarCadastrosDaPlanilha(PLANO, p);
    expect(r).toEqual({ ok: true });
    expect(chamadas).toEqual([
      "reativar R r2 ordem 3",
      "criar R Mãe cor 3 ordem 4",
      "criar R Casal cor 4 ordem 5",
      "reativar T t7",
      "criar T Casa",
      "reativar S s7",
      "criar S Pago",
      "criar S Pendente",
      "pago s9 true",
    ]);
  });

  it("não cabem as 8 cores: para antes de criar qualquer coisa", async () => {
    const oito = Array.from({ length: 7 }, (_, i) => resp(i + 1));
    const { p, chamadas } = portas({ responsaveis: oito });
    const r = await criarCadastrosDaPlanilha({ ...PLANO, reativar: { responsaveis: [], tipos: [], status: [] } }, p);
    expect(r).toEqual({ ok: false, codigo: "responsavel.sem_cor_livre" });
    expect(chamadas).toEqual([]);
    expect(cabemOsResponsaveis(oito, 1)).toBe(true);
    expect(cabemOsResponsaveis(oito, 2)).toBe(false);
  });

  it("uma falha de gravação para tudo e devolve o código", async () => {
    const { p } = portas();
    p.tipos.criar = vi.fn(async () => ({ ok: false, codigo: "salvar.falhou" }) as const);
    expect(await criarCadastrosDaPlanilha(PLANO, p)).toEqual({ ok: false, codigo: "salvar.falhou" });
  });

  it("falha ao ler o banco: carregar.falhou", async () => {
    const { p } = portas();
    p.ler = async () => ({ ok: false });
    expect(await criarCadastrosDaPlanilha(PLANO, p)).toEqual({ ok: false, codigo: "carregar.falhou" });
  });
});
