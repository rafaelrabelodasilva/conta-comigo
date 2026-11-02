// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROTULOS, mensagem } from "@/domain/mensagens";
import type { LinhaConfigCiclo } from "@/data/ciclo-repo";
import { ToastProvider } from "@/ui/Toast";
import { SecaoCiclo } from "./SecaoCiclo";

// A seção lê pelo gerenciador de Realtime e grava pelo repositório; aqui os
// dois são falsos: o teste confere o que a tela manda gravar.
const falso = vi.hoisted(() => ({
  linhas: [] as unknown[],
  inserir: vi.fn(),
}));

vi.mock("@/data/realtime", () => ({
  useLinhas: () => ({ status: "pronto", linhas: falso.linhas }),
  gerenciador: () => ({ recarregar: vi.fn() }),
}));
vi.mock("@/data/ciclo-repo", () => ({ repoCiclo: () => ({ inserir: falso.inserir }) }));

const linhaCiclo = (extra: Partial<LinhaConfigCiclo>): LinhaConfigCiclo => ({
  id: "c1",
  owner_id: "dono",
  dia_fechamento: 28,
  dia_vencimento: 6,
  vigente_desde: "2026-12",
  created_at: "2026-11-02T12:00:00+00:00",
  updated_at: "2026-11-02T12:00:00+00:00",
  ...extra,
});

function montar(aoMudarRascunho?: (tem: boolean) => void) {
  render(
    <ToastProvider>
      <SecaoCiclo aoMudarRascunho={aoMudarRascunho} />
    </ToastProvider>,
  );
  return {
    fechamento: screen.getByLabelText<HTMLInputElement>(ROTULOS.dia_fechamento),
    vencimento: screen.getByLabelText<HTMLInputElement>(ROTULOS.dia_vencimento),
    salvar: screen.getByRole("button", { name: ROTULOS.salvar }),
  };
}

async function preencher(campos: ReturnType<typeof montar>, fechamento: string, vencimento: string) {
  const usuario = userEvent.setup();
  await usuario.clear(campos.fechamento);
  if (fechamento) await usuario.type(campos.fechamento, fechamento);
  await usuario.clear(campos.vencimento);
  if (vencimento) await usuario.type(campos.vencimento, vencimento);
  await usuario.click(campos.salvar);
}

describe("SecaoCiclo", () => {
  beforeEach(() => {
    // Só o relógio é falso (02/11/26 em São Paulo); os temporizadores são reais.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T15:00:00Z"));
    falso.linhas = [];
    falso.inserir.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Ciclo pela tela: fechamento 28 e vencimento 6 inserem na ordem certa, com vigente_desde do núcleo", async () => {
    falso.inserir.mockResolvedValue({ ok: true });
    const campos = montar();
    await preencher(campos, "28", "6");
    expect(falso.inserir).toHaveBeenCalledTimes(1);
    // Primeira configuração: vale já para o Ciclo de hoje (02/11 → Dez/26).
    expect(falso.inserir).toHaveBeenCalledWith({ dia_fechamento: 28, dia_vencimento: 6, vigente_desde: "2026-12" });
  });

  it("plano null (os dias já são os que valeriam): não chama inserir", async () => {
    falso.linhas = [linhaCiclo({})];
    const campos = montar();
    expect(campos.fechamento.value).toBe("28");
    expect(campos.vencimento.value).toBe("6");
    await preencher(campos, "28", "6");
    expect(falso.inserir).not.toHaveBeenCalled();
  });

  it("recusa do banco: toast com a mensagem do código e os campos mantidos", async () => {
    falso.inserir.mockResolvedValue({ ok: false, codigo: "ciclo.vigente_no_passado" });
    const campos = montar();
    await preencher(campos, "28", "6");
    expect(await screen.findByText(mensagem("ciclo.vigente_no_passado"))).toBeTruthy();
    expect(campos.fechamento.value).toBe("28");
    expect(campos.vencimento.value).toBe("6");
  });

  it("dia inválido mostra a mensagem no campo e não grava", async () => {
    const campos = montar();
    await preencher(campos, "32", "6");
    expect(falso.inserir).not.toHaveBeenCalled();
    expect(campos.fechamento.getAttribute("aria-invalid")).toBe("true");
    const idErro = campos.fechamento.getAttribute("aria-describedby")!;
    expect(document.getElementById(idErro)?.textContent).toBe(mensagem("ciclo.dia_invalido"));
    expect(campos.vencimento.getAttribute("aria-invalid")).toBeNull();
  });

  it("aoMudarRascunho avisa quando os dias digitados diferem dos salvos", async () => {
    falso.linhas = [linhaCiclo({})];
    const aviso = vi.fn();
    const campos = montar(aviso);
    expect(aviso).toHaveBeenLastCalledWith(false);
    const usuario = userEvent.setup();
    await usuario.clear(campos.fechamento);
    await usuario.type(campos.fechamento, "5");
    expect(aviso).toHaveBeenLastCalledWith(true);
    await usuario.clear(campos.fechamento);
    await usuario.type(campos.fechamento, "28");
    expect(aviso).toHaveBeenLastCalledWith(false);
  });
});
