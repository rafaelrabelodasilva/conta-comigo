// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROTULOS, mensagem } from "@/domain/mensagens";
import { ToastProvider } from "@/ui/Toast";
import { useExcluirCadastro } from "./ExcluirCadastro";
import { SecaoResponsaveis } from "./SecaoResponsaveis";
import { SecaoStatus } from "./SecaoStatus";
import { SecaoTipos } from "./SecaoTipos";

// Sem conexão, os repositórios devolvem `conexao.gravar_sem_conexao`; as
// telas mostram o aviso próprio (pelo código), não o "salvar.falhou".
const SEM_CONEXAO = { ok: false, codigo: "conexao.gravar_sem_conexao" } as const;

const falso = vi.hoisted(() => ({
  criarResponsavel: vi.fn(),
  criarTipo: vi.fn(),
  criarStatus: vi.fn(),
  contarUsos: vi.fn(),
}));

vi.mock("@/data/realtime", () => ({
  useLinhas: () => ({ status: "pronto", linhas: [] }),
  gerenciador: () => ({ recarregar: vi.fn() }),
}));
vi.mock("@/data/responsaveis-repo", () => ({ repoResponsaveis: () => ({ criar: falso.criarResponsavel }) }));
vi.mock("@/data/tipos-repo", () => ({ repoTipos: () => ({ criar: falso.criarTipo }) }));
vi.mock("@/data/status-repo", () => ({ repoStatus: () => ({ criar: falso.criarStatus }) }));
vi.mock("@/data/cadastros-repo", () => ({ repoCadastros: () => ({ contarUsos: falso.contarUsos }) }));
vi.mock("@/data/configuracoes-repo", async (original) => ({
  ...(await original<typeof import("@/data/configuracoes-repo")>()),
  repoConfiguracoes: () => ({}),
}));

const aviso = () => screen.findByText(mensagem("conexao.gravar_sem_conexao"));

async function criarOffline(Secao: () => React.JSX.Element, rotuloNome: string) {
  render(
    <ToastProvider>
      <Secao />
    </ToastProvider>,
  );
  const usuario = userEvent.setup();
  await usuario.click(screen.getByRole("button", { name: ROTULOS.novo }));
  await usuario.type(screen.getByLabelText(rotuloNome), "Novo nome");
  await usuario.click(screen.getByRole("button", { name: ROTULOS.adicionar }));
}

describe("telas de Configurações sem conexão", () => {
  beforeEach(() => {
    for (const f of Object.values(falso)) f.mockReset();
    falso.contarUsos.mockResolvedValue({ ok: true, valor: new Map() });
  });

  it("Responsáveis: criar offline mostra o aviso próprio", async () => {
    falso.criarResponsavel.mockResolvedValue(SEM_CONEXAO);
    await criarOffline(() => <SecaoResponsaveis />, ROTULOS.nome_novo_responsavel);
    expect(falso.criarResponsavel).toHaveBeenCalledTimes(1);
    expect(await aviso()).toBeTruthy();
  });

  it("Tipos: criar offline mostra o aviso próprio", async () => {
    falso.criarTipo.mockResolvedValue(SEM_CONEXAO);
    await criarOffline(() => <SecaoTipos />, ROTULOS.nome_novo_tipo);
    expect(falso.criarTipo).toHaveBeenCalledTimes(1);
    expect(await aviso()).toBeTruthy();
  });

  it("Status: criar offline mostra o aviso próprio", async () => {
    falso.criarStatus.mockResolvedValue(SEM_CONEXAO);
    await criarOffline(() => <SecaoStatus />, ROTULOS.nome_novo_status);
    expect(falso.criarStatus).toHaveBeenCalledTimes(1);
    expect(await aviso()).toBeTruthy();
  });

  it("Excluir: contagem sem conexão mostra o aviso próprio e não abre janela", async () => {
    falso.contarUsos.mockResolvedValue(SEM_CONEXAO);
    function Excluir() {
      const exclusao = useExcluirCadastro({ cadastro: "tipo", opcoes: () => [], aoArquivar: () => {} });
      return (
        <>
          <button type="button" onClick={() => void exclusao.pedir({ id: "a", nome: "Casa" })}>
            pedir
          </button>
          {exclusao.elemento}
        </>
      );
    }
    render(
      <ToastProvider>
        <Excluir />
      </ToastProvider>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "pedir" }));
    expect(falso.contarUsos).toHaveBeenCalledWith("tipo");
    expect(await aviso()).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
