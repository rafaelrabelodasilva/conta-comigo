// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEXTOS_NOTIFICACOES as T } from "@/domain/mensagens";
import type { AmbienteDeNotificacao, InscricaoDePush, MarcaDeNotificacao } from "@/domain/notificacoes";
import { ToastProvider } from "@/ui/Toast";
import type { NavegadorDePush } from "./navegador-de-push";
import { ReativarNotificacoes, reiniciarReativacaoDestaAbertura } from "./ReativarNotificacoes";
import { EVENTO_NOTIFICACOES_REATIVADAS, type MarcaDoAparelho } from "./reativar-notificacoes";

// Defeito 8 (História 7.5): ao abrir o app com a permissão JÁ dada e sem inscrição neste aparelho, o app refaz a
// inscrição e a grava, e diz em texto que reativou. Nunca pede a permissão; não renasce depois de "Desativar".

const PC: AmbienteDeNotificacao = {
  chaveConfigurada: true,
  temServiceWorker: true,
  temPushManager: true,
  temNotification: true,
  ehIOS: false,
  instalado: false,
  permissao: "granted",
  inscrito: false,
};
const INSCRICAO: InscricaoDePush = { endpoint: "https://push.exemplo/segredo-do-endpoint", p256dh: "p", auth: "a" };

function navegadorFalso(inicial: Partial<AmbienteDeNotificacao> = {}) {
  const estado = { ...PC, ...inicial };
  return {
    ler: vi.fn(async () => ({ ...estado })),
    pedirPermissao: vi.fn(async () => estado.permissao),
    inscrever: vi.fn(async () => {
      estado.inscrito = true;
      return INSCRICAO;
    }),
    inscricaoAtual: vi.fn(async () => (estado.inscrito ? INSCRICAO : null)),
    cancelar: vi.fn(async () => true),
  } satisfies NavegadorDePush;
}

const marca = (valor: MarcaDeNotificacao | null): MarcaDoAparelho => ({ ler: () => valor, gravar: vi.fn() });
const repoFalso = (ok = true) => ({
  salvar: vi.fn(async () => (ok ? { ok: true as const } : { ok: false as const, codigo: "salvar.falhou" as const })),
});

function montar(navegador: NavegadorDePush, repo = repoFalso(), m: MarcaDoAparelho = marca("ativa"), online = () => true) {
  render(
    <ToastProvider>
      <ReativarNotificacoes navegador={navegador} repo={repo} marca={m} online={online} />
    </ToastProvider>,
  );
  return repo;
}

beforeEach(() => {
  reiniciarReativacaoDestaAbertura();
});

describe("ReativarNotificacoes: permissão dada, sem inscrição neste aparelho", () => {
  it("refaz a inscrição, grava e diz em texto que reativou (sem pedir a permissão)", async () => {
    const navegador = navegadorFalso();
    const repo = montar(navegador);
    expect(await screen.findByText(T.reativadas)).toBeTruthy();
    expect(navegador.inscrever).toHaveBeenCalledOnce();
    expect(repo.salvar).toHaveBeenCalledExactlyOnceWith(INSCRICAO);
    expect(navegador.pedirPermissao).not.toHaveBeenCalled();
  });

  it("avisa a tela de Configurações (se aberta) para reler o estado", async () => {
    const aoReativar = vi.fn();
    window.addEventListener(EVENTO_NOTIFICACOES_REATIVADAS, aoReativar);
    montar(navegadorFalso());
    await screen.findByText(T.reativadas);
    expect(aoReativar).toHaveBeenCalledOnce();
    window.removeEventListener(EVENTO_NOTIFICACOES_REATIVADAS, aoReativar);
  });

  it("só uma tentativa por abertura do app, mesmo se o componente montar de novo", async () => {
    const navegador = navegadorFalso();
    montar(navegador);
    await screen.findByText(T.reativadas);
    montar(navegador);
    await waitFor(() => expect(navegador.ler).toHaveBeenCalledTimes(1));
    expect(navegador.inscrever).toHaveBeenCalledOnce();
  });

  it("não desenha nada por si só: sem texto algum quando não há o que refazer", async () => {
    const navegador = navegadorFalso({ inscrito: true });
    montar(navegador);
    await waitFor(() => expect(navegador.ler).toHaveBeenCalled());
    expect(screen.queryByText(T.reativadas)).toBeNull();
    expect(navegador.inscrever).not.toHaveBeenCalled();
  });
});

describe("ReativarNotificacoes: quando NÃO refaz", () => {
  it("permissão ainda não dada: não inscreve (pedir é do toque do Rafael)", async () => {
    const navegador = navegadorFalso({ permissao: "default" });
    const repo = montar(navegador);
    await waitFor(() => expect(navegador.ler).toHaveBeenCalled());
    expect(navegador.inscrever).not.toHaveBeenCalled();
    expect(navegador.pedirPermissao).not.toHaveBeenCalled();
    expect(repo.salvar).not.toHaveBeenCalled();
  });

  it("o Rafael desativou neste aparelho: não renasce", async () => {
    const navegador = navegadorFalso();
    const repo = montar(navegador, repoFalso(), marca("desativada"));
    await waitFor(() => expect(navegador.ler).toHaveBeenCalled());
    expect(navegador.inscrever).not.toHaveBeenCalled();
    expect(repo.salvar).not.toHaveBeenCalled();
    expect(screen.queryByText(T.reativadas)).toBeNull();
  });

  it("sem conexão: não tenta", async () => {
    const navegador = navegadorFalso();
    const repo = montar(navegador, repoFalso(), marca("ativa"), () => false);
    await waitFor(() => expect(navegador.ler).toHaveBeenCalled());
    expect(repo.salvar).not.toHaveBeenCalled();
  });

  it("o banco recusa: sem texto de reativação (a tela de Configurações continua oferecendo Ativar notificações)", async () => {
    const navegador = navegadorFalso();
    const repo = montar(navegador, repoFalso(false));
    await waitFor(() => expect(repo.salvar).toHaveBeenCalled());
    expect(screen.queryByText(T.reativadas)).toBeNull();
    expect(navegador.cancelar).toHaveBeenCalledOnce();
  });
});
