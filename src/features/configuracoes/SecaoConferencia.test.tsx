// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatarDinheiro } from "@/domain/dinheiro";
import { ROTULOS, mensagem } from "@/domain/mensagens";
import { ToastProvider } from "@/ui/Toast";
import { SecaoConferencia } from "./SecaoConferencia";

// Gerenciador de Realtime e repositório falsos: o teste confere o que a tela
// manda gravar.
const falso = vi.hoisted(() => ({
  linhas: [] as unknown[],
  definirConferencia: vi.fn(),
}));

vi.mock("@/data/realtime", () => ({
  useLinhas: () => ({ status: "pronto", linhas: falso.linhas }),
  gerenciador: () => ({ recarregar: vi.fn() }),
}));
vi.mock("@/data/configuracoes-repo", async (original) => ({
  ...(await original<typeof import("@/data/configuracoes-repo")>()),
  repoConfiguracoes: () => ({ definirConferencia: falso.definirConferencia }),
}));

function montar() {
  render(
    <ToastProvider>
      <SecaoConferencia />
    </ToastProvider>,
  );
  return {
    limite: screen.getByLabelText<HTMLInputElement>(ROTULOS.limite_ajuste),
    tolerancia: screen.getByLabelText<HTMLInputElement>(ROTULOS.tolerancia_atraso),
    salvar: screen.getByRole("button", { name: ROTULOS.salvar }),
  };
}

async function preencher(campos: ReturnType<typeof montar>, limite: string, tolerancia: string) {
  const usuario = userEvent.setup();
  await usuario.clear(campos.limite);
  await usuario.type(campos.limite, limite);
  await usuario.clear(campos.tolerancia);
  await usuario.type(campos.tolerancia, tolerancia);
  await usuario.click(campos.salvar);
}

function erroDo(campo: HTMLInputElement): string | null | undefined {
  const id = campo.getAttribute("aria-describedby");
  return id ? document.getElementById(id)?.textContent : null;
}

describe("SecaoConferencia", () => {
  beforeEach(() => {
    falso.linhas = [];
    falso.definirConferencia.mockReset();
  });

  it("sem linha, mostra os padrões (R$ 1,00 e 10 dias)", () => {
    const campos = montar();
    // `formatarDinheiro` usa espaço não separável entre "R$" e o valor.
    expect(campos.limite.value).toBe(formatarDinheiro(100));
    expect(campos.limite.value.replace(/\s/g, " ")).toBe("R$ 1,00");
    expect(campos.tolerancia.value).toBe("10");
  });

  it("grava os dois valores numa só chamada", async () => {
    falso.definirConferencia.mockResolvedValue({ ok: true });
    const campos = montar();
    await preencher(campos, "1,50", "15");
    expect(falso.definirConferencia).toHaveBeenCalledTimes(1);
    expect(falso.definirConferencia).toHaveBeenCalledWith({
      limite_ajuste_centavos: 150,
      tolerancia_atraso_dias: 15,
    });
  });

  it("fora do intervalo: mensagem no campo e nada gravado", async () => {
    const campos = montar();
    await preencher(campos, "20,00", "61");
    expect(falso.definirConferencia).not.toHaveBeenCalled();
    expect(erroDo(campos.limite)).toBe(mensagem("ajuste.limite_fora"));
    expect(erroDo(campos.tolerancia)).toBe(mensagem("atraso.tolerancia_invalida"));
  });

  it("recusa do banco: toast e os campos mantidos", async () => {
    falso.definirConferencia.mockResolvedValue({ ok: false, codigo: "salvar.falhou" });
    const campos = montar();
    await preencher(campos, "2,00", "20");
    expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
    expect(campos.limite.value).toBe("2,00");
    expect(campos.tolerancia.value).toBe("20");
  });

  it("sem conexão mostra o aviso próprio e mantém os campos", async () => {
    falso.definirConferencia.mockResolvedValue({ ok: false, codigo: "conexao.gravar_sem_conexao" });
    const campos = montar();
    await preencher(campos, "2,00", "20");
    expect(await screen.findByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
    expect(campos.limite.value).toBe("2,00");
  });
});
