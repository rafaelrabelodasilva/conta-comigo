// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TEXTOS_NOTIFICACOES as T, mensagem } from "@/domain/mensagens";
import type { AmbienteDeNotificacao, InscricaoDePush, PermissaoDeNotificacao } from "@/domain/notificacoes";
import { ToastProvider } from "@/ui/Toast";
import { AtivarNotificacoes } from "./AtivarNotificacoes";
import type { NavegadorDePush } from "./navegador-de-push";
import { EVENTO_NOTIFICACOES_REATIVADAS, type MarcaDoAparelho } from "./reativar-notificacoes";

// "Ativar notificações" (História 7.5, FR-55): os estados em texto, a permissão só no toque, a inscrição guardada
// pelo repositório e desfeita no navegador se o banco recusar, "Desativar neste aparelho", sem conexão. O navegador
// e o repositório são falsos: nenhuma permissão real, nenhuma inscrição real.

const PC: AmbienteDeNotificacao = {
  chaveConfigurada: true,
  temServiceWorker: true,
  temPushManager: true,
  temNotification: true,
  ehIOS: false,
  instalado: false,
  permissao: "default",
  inscrito: false,
};
const INSCRICAO: InscricaoDePush = { endpoint: "https://push.exemplo/segredo-do-endpoint", p256dh: "p", auth: "a" };

/** Um navegador falso que lembra o que aconteceu: a permissão e a inscrição mudam como no aparelho de verdade. */
function navegadorFalso(inicial: Partial<AmbienteDeNotificacao> = {}, opcoes: { concede?: PermissaoDeNotificacao; inscreve?: boolean; cancela?: boolean } = {}) {
  const estado = { ...PC, ...inicial };
  const navegador = {
    ler: vi.fn(async () => ({ ...estado })),
    pedirPermissao: vi.fn(async () => {
      estado.permissao = opcoes.concede ?? "granted";
      return estado.permissao;
    }),
    inscrever: vi.fn(async () => {
      if (opcoes.inscreve === false) return null;
      estado.inscrito = true;
      return INSCRICAO;
    }),
    inscricaoAtual: vi.fn(async () => (estado.inscrito ? INSCRICAO : null)),
    cancelar: vi.fn(async () => {
      if (opcoes.cancela === false) return false;
      estado.inscrito = false;
      return true;
    }),
  } satisfies NavegadorDePush;
  return { navegador, estado };
}

const repoFalso = (salvar: { ok: boolean; codigo?: string } = { ok: true }, remover: { ok: boolean; codigo?: string } = { ok: true }) => ({
  salvar: vi.fn(async () => salvar),
  remover: vi.fn(async () => remover),
}) as unknown as Parameters<typeof AtivarNotificacoes>[0]["repo"] & { salvar: ReturnType<typeof vi.fn>; remover: ReturnType<typeof vi.fn> };

function montar(
  navegador: NavegadorDePush,
  repo = repoFalso(),
  online: () => boolean = () => true,
) {
  render(
    <ToastProvider>
      <AtivarNotificacoes navegador={navegador} repo={repo} online={online} />
    </ToastProvider>,
  );
  return repo;
}

const botao = (nome: string) => screen.getByRole("button", { name: nome });
const semBotao = () => expect(screen.queryAllByRole("button")).toEqual([]);
const estado = async (texto: string) => {
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe(texto));
};

describe("AtivarNotificacoes: os estados (sempre em texto)", () => {
  it("PC no navegador: diz que está desativado e oferece 'Ativar notificações' (alvo de 44 pt)", async () => {
    montar(navegadorFalso().navegador);
    await estado(T.estado_pode_ativar);
    expect(botao(T.ativar).className).toContain("min-h-toque");
    expect(screen.getByRole("group", { name: T.titulo })).toBeTruthy();
  });

  it("ativo neste aparelho: diz que está ativado e oferece 'Desativar neste aparelho'", async () => {
    montar(navegadorFalso({ permissao: "granted", inscrito: true }).navegador);
    await estado(T.estado_ativo);
    expect(botao(T.desativar).className).toContain("min-h-toque");
    expect(screen.queryByRole("button", { name: T.ativar })).toBeNull();
  });

  it("iPad sem o app instalado na tela inicial: explica como instalar e não oferece botão", async () => {
    montar(navegadorFalso({ ehIOS: true, instalado: false, temPushManager: false }).navegador);
    await estado(T.estado_instalar_primeiro);
    expect(screen.getByRole("status").textContent).toMatch(/Adicionar à Tela de Início/);
    semBotao();
  });

  it("iPad com o app instalado: pode ativar", async () => {
    montar(navegadorFalso({ ehIOS: true, instalado: true }).navegador);
    await estado(T.estado_pode_ativar);
    botao(T.ativar);
  });

  it("navegador sem suporte: diz isso e não oferece botão", async () => {
    montar(navegadorFalso({ temPushManager: false }).navegador);
    await estado(T.estado_sem_suporte);
    semBotao();
  });

  it("permissão bloqueada: diz o caminho para liberar e não oferece botão", async () => {
    montar(navegadorFalso({ permissao: "denied" }).navegador);
    await estado(T.estado_negada);
    expect(screen.getByRole("status").textContent).toMatch(/Ajustes → Notificações/);
    semBotao();
  });

  it("ambiente sem a chave pública VAPID (Previews): diz que não está configurado e não oferece botão", async () => {
    montar(navegadorFalso({ chaveConfigurada: false }).navegador);
    await estado(T.estado_sem_chave);
    semBotao();
  });

  it("o estado fica numa região role=status e nada rouba o foco ao carregar", async () => {
    montar(navegadorFalso().navegador);
    await estado(T.estado_pode_ativar);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("AtivarNotificacoes: ativar (a permissão só no toque)", () => {
  it("abrir a tela NÃO pede a permissão, nem inscreve, nem grava", async () => {
    const { navegador } = navegadorFalso();
    const repo = montar(navegador);
    await estado(T.estado_pode_ativar);
    expect(navegador.pedirPermissao).not.toHaveBeenCalled();
    expect(navegador.inscrever).not.toHaveBeenCalled();
    expect(repo.salvar).not.toHaveBeenCalled();
  });

  it("o toque pede a permissão, inscreve, guarda a inscrição e passa a 'ativado'", async () => {
    const { navegador } = navegadorFalso();
    const repo = montar(navegador);
    await estado(T.estado_pode_ativar);
    await userEvent.setup().click(botao(T.ativar));

    await estado(T.estado_ativo);
    expect(navegador.pedirPermissao).toHaveBeenCalledTimes(1);
    expect(navegador.inscrever).toHaveBeenCalledTimes(1);
    expect(repo.salvar).toHaveBeenCalledWith(INSCRICAO);
    // A ordem: permissão, depois inscrição, depois o banco.
    const ordem = (f: { mock: { invocationCallOrder: number[] } }) => f.mock.invocationCallOrder[0];
    expect(ordem(navegador.pedirPermissao)).toBeLessThan(ordem(navegador.inscrever));
    expect(ordem(navegador.inscrever)).toBeLessThan(ordem(repo.salvar));
    botao(T.desativar);
  });

  it("a permissão é pedida DENTRO do manipulador do toque, de forma síncrona, antes de qualquer espera", async () => {
    const { navegador } = navegadorFalso();
    montar(navegador);
    await estado(T.estado_pode_ativar);
    // Entre o início e o fim do despacho do clique (a raiz do React roda antes do ouvinte do `document`).
    let dentroDoClique = false;
    const entrar = () => (dentroDoClique = true);
    const sair = () => (dentroDoClique = false);
    document.addEventListener("click", entrar, true);
    document.addEventListener("click", sair);
    const original = navegador.pedirPermissao.getMockImplementation()!;
    let pedidaDentro: boolean | null = null;
    navegador.pedirPermissao.mockImplementation(() => {
      pedidaDentro = dentroDoClique;
      return original();
    });
    await userEvent.setup().click(botao(T.ativar));
    await estado(T.estado_ativo);
    document.removeEventListener("click", entrar, true);
    document.removeEventListener("click", sair);
    expect(pedidaDentro).toBe(true);
  });

  it("enquanto ativa, o botão diz 'Ativando…', fica desabilitado e um segundo toque não pede de novo", async () => {
    const { navegador } = navegadorFalso();
    let liberar: (r: { ok: boolean }) => void = () => {};
    const repo = repoFalso();
    repo.salvar.mockImplementation(() => new Promise((r) => (liberar = r)));
    montar(navegador, repo);
    await estado(T.estado_pode_ativar);
    const usuario = userEvent.setup();
    await usuario.click(botao(T.ativar));
    const ocupado = await screen.findByRole("button", { name: T.ativando });
    expect((ocupado as HTMLButtonElement).disabled).toBe(true);
    await usuario.click(ocupado);
    expect(navegador.pedirPermissao).toHaveBeenCalledTimes(1);
    liberar({ ok: true });
    await estado(T.estado_ativo);
  });

  it("o usuário nega: passa a 'bloqueado' com o caminho para liberar, sem inscrever nem gravar", async () => {
    const { navegador } = navegadorFalso({}, { concede: "denied" });
    const repo = montar(navegador);
    await estado(T.estado_pode_ativar);
    await userEvent.setup().click(botao(T.ativar));
    await estado(T.estado_negada);
    expect(navegador.inscrever).not.toHaveBeenCalled();
    expect(repo.salvar).not.toHaveBeenCalled();
  });

  it("o usuário dispensa a janela de permissão (continua 'default'): segue desativado, sem erro, e dá para tentar de novo", async () => {
    const { navegador } = navegadorFalso({}, { concede: "default" });
    const repo = montar(navegador);
    await estado(T.estado_pode_ativar);
    await userEvent.setup().click(botao(T.ativar));
    await waitFor(() => expect(navegador.ler.mock.calls.length).toBeGreaterThan(1));
    await estado(T.estado_pode_ativar);
    expect(navegador.inscrever).not.toHaveBeenCalled();
    expect(repo.salvar).not.toHaveBeenCalled();
    expect(screen.queryByText(T.erro_ativar)).toBeNull();
    botao(T.ativar);
  });

  it("o navegador não cria a inscrição: erro ao ativar, nada gravado", async () => {
    const { navegador } = navegadorFalso({}, { inscreve: false });
    const repo = montar(navegador);
    await estado(T.estado_pode_ativar);
    await userEvent.setup().click(botao(T.ativar));
    expect(await screen.findByText(T.erro_ativar)).toBeTruthy();
    expect(repo.salvar).not.toHaveBeenCalled();
    await estado(T.estado_pode_ativar);
  });

  it("o banco recusa a inscrição: 'Não foi possível salvar', a inscrição do navegador é desfeita e segue desativado", async () => {
    const { navegador } = navegadorFalso();
    const repo = montar(navegador, repoFalso({ ok: false, codigo: "salvar.falhou" }));
    await estado(T.estado_pode_ativar);
    await userEvent.setup().click(botao(T.ativar));
    expect(await screen.findByText(mensagem("salvar.falhou"))).toBeTruthy();
    expect(navegador.cancelar).toHaveBeenCalledTimes(1);
    expect(repo.salvar).toHaveBeenCalledTimes(1);
    await estado(T.estado_pode_ativar);
    botao(T.ativar);
  });

  it("sem conexão: avisa, não pede a permissão e não tenta nada", async () => {
    const { navegador } = navegadorFalso();
    const repo = montar(navegador, repoFalso(), () => false);
    await estado(T.estado_pode_ativar);
    await userEvent.setup().click(botao(T.ativar));
    expect(await screen.findByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
    expect(navegador.pedirPermissao).not.toHaveBeenCalled();
    expect(repo.salvar).not.toHaveBeenCalled();
  });

  it("o endereço da inscrição nunca aparece na tela, nem no erro", async () => {
    const { navegador } = navegadorFalso();
    montar(navegador, repoFalso({ ok: false, codigo: "salvar.falhou" }));
    await estado(T.estado_pode_ativar);
    await userEvent.setup().click(botao(T.ativar));
    await screen.findByText(mensagem("salvar.falhou"));
    expect(document.body.textContent).not.toContain("segredo-do-endpoint");
  });
});

describe("AtivarNotificacoes: desativar neste aparelho", () => {
  it("apaga a inscrição do banco (pelo endereço deste aparelho) e depois cancela no navegador", async () => {
    const { navegador } = navegadorFalso({ permissao: "granted", inscrito: true });
    const repo = montar(navegador);
    await estado(T.estado_ativo);
    await userEvent.setup().click(botao(T.desativar));
    await estado(T.estado_pode_ativar);
    expect(repo.remover).toHaveBeenCalledWith(INSCRICAO.endpoint);
    expect(navegador.cancelar).toHaveBeenCalledTimes(1);
    expect(repo.remover.mock.invocationCallOrder[0]).toBeLessThan(navegador.cancelar.mock.invocationCallOrder[0]);
    botao(T.ativar);
  });

  it("o banco recusa: erro, a inscrição do navegador fica e o estado segue 'ativado'", async () => {
    const { navegador } = navegadorFalso({ permissao: "granted", inscrito: true });
    montar(navegador, repoFalso({ ok: true }, { ok: false, codigo: "salvar.falhou" }));
    await estado(T.estado_ativo);
    await userEvent.setup().click(botao(T.desativar));
    expect(await screen.findByText(T.erro_desativar)).toBeTruthy();
    expect(navegador.cancelar).not.toHaveBeenCalled();
    await estado(T.estado_ativo);
  });

  it("o navegador não cancela: erro e continua 'ativado'", async () => {
    const { navegador } = navegadorFalso({ permissao: "granted", inscrito: true }, { cancela: false });
    montar(navegador);
    await estado(T.estado_ativo);
    await userEvent.setup().click(botao(T.desativar));
    expect(await screen.findByText(T.erro_desativar)).toBeTruthy();
    await estado(T.estado_ativo);
  });

  it("sem conexão: avisa e não apaga nada", async () => {
    const { navegador } = navegadorFalso({ permissao: "granted", inscrito: true });
    const repo = montar(navegador, repoFalso(), () => false);
    await estado(T.estado_ativo);
    await userEvent.setup().click(botao(T.desativar));
    expect(await screen.findByText(mensagem("conexao.gravar_sem_conexao"))).toBeTruthy();
    expect(repo.remover).not.toHaveBeenCalled();
    expect(navegador.cancelar).not.toHaveBeenCalled();
  });
});

describe("AtivarNotificacoes e a marca deste aparelho (Defeito 8)", () => {
  const marcaFalsa = () => ({ ler: () => null, gravar: vi.fn<MarcaDoAparelho["gravar"]>() }) satisfies MarcaDoAparelho;
  const montarComMarca = (navegador: NavegadorDePush, marca: MarcaDoAparelho) =>
    render(
      <ToastProvider>
        <AtivarNotificacoes navegador={navegador} repo={repoFalso()} online={() => true} marca={marca} />
      </ToastProvider>,
    );

  it("Ativar notificações (deu certo): o aparelho passa a lembrar que esteve ativado, para o app refazer a inscrição se o navegador a perder", async () => {
    const marca = marcaFalsa();
    montarComMarca(navegadorFalso().navegador, marca);
    await estado(T.estado_pode_ativar);
    await userEvent.setup().click(botao(T.ativar));
    await estado(T.estado_ativo);
    expect(marca.gravar).toHaveBeenCalledExactlyOnceWith("ativa");
  });

  it("Ativar notificações com o banco recusando: nada é lembrado", async () => {
    const marca = marcaFalsa();
    render(
      <ToastProvider>
        <AtivarNotificacoes
          navegador={navegadorFalso().navegador}
          repo={repoFalso({ ok: false, codigo: "salvar.falhou" })}
          online={() => true}
          marca={marca}
        />
      </ToastProvider>,
    );
    await estado(T.estado_pode_ativar);
    await userEvent.setup().click(botao(T.ativar));
    await screen.findByText(mensagem("salvar.falhou"));
    expect(marca.gravar).not.toHaveBeenCalled();
  });

  it("Desativar neste aparelho: grava desativada, e o app nunca a reativa à força", async () => {
    const marca = marcaFalsa();
    montarComMarca(navegadorFalso({ permissao: "granted", inscrito: true }).navegador, marca);
    await estado(T.estado_ativo);
    await userEvent.setup().click(botao(T.desativar));
    await estado(T.estado_pode_ativar);
    expect(marca.gravar).toHaveBeenCalledExactlyOnceWith("desativada");
  });

  it("quando o app reativa sozinho a inscrição, a tela de Configurações relê o estado e passa a dizer ativado", async () => {
    const { navegador, estado: ambiente } = navegadorFalso({ permissao: "granted", inscrito: false });
    montarComMarca(navegador, marcaFalsa());
    await estado(T.estado_pode_ativar);
    // O app (ReativarNotificacoes) refez a inscrição no navegador e avisou a tela.
    ambiente.inscrito = true;
    act(() => {
      window.dispatchEvent(new Event(EVENTO_NOTIFICACOES_REATIVADAS));
    });
    await estado(T.estado_ativo);
  });
});
