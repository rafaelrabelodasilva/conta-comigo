import { describe, expect, it, vi } from "vitest";
import type { AmbienteDeNotificacao, InscricaoDePush, MarcaDeNotificacao } from "@/domain/notificacoes";
import type { NavegadorDePush } from "./navegador-de-push";
import { reativarNotificacoesSeNecessario, type MarcaDoAparelho } from "./reativar-notificacoes";

// Refazer a inscrição que o navegador perdeu (Defeito 8, História 7.5): permissão dada e sem inscrição neste aparelho,
// o app a refaz e a grava; nunca pede a permissão; quem desativou de propósito não é reativado. Navegador, repositório
// e a marca do aparelho são falsos: nenhuma permissão, inscrição nem rede reais.

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

function navegadorFalso(inicial: Partial<AmbienteDeNotificacao> = {}, inscreve: InscricaoDePush | null = INSCRICAO) {
  const estado = { ...PC, ...inicial };
  const navegador = {
    ler: vi.fn(async () => ({ ...estado })),
    pedirPermissao: vi.fn(async () => estado.permissao),
    inscrever: vi.fn(async () => {
      if (inscreve === null) return null;
      estado.inscrito = true;
      return inscreve;
    }),
    inscricaoAtual: vi.fn(async () => (estado.inscrito ? INSCRICAO : null)),
    cancelar: vi.fn(async () => {
      estado.inscrito = false;
      return true;
    }),
  } satisfies NavegadorDePush;
  return { navegador, estado };
}

const marcaFalsa = (inicial: MarcaDeNotificacao | null): MarcaDoAparelho & { atual: () => MarcaDeNotificacao | null } => {
  let valor = inicial;
  return {
    ler: () => valor,
    gravar: (m) => {
      valor = m;
    },
    atual: () => valor,
  };
};

const repoFalso = (ok = true) => ({
  salvar: vi.fn(async () => (ok ? { ok: true as const } : { ok: false as const, codigo: "salvar.falhou" as const })),
});

describe("reativarNotificacoesSeNecessario", () => {
  it("permissão dada, aparelho que já esteve ativado e sem inscrição: inscreve de novo, grava e diz reativou", async () => {
    const { navegador } = navegadorFalso();
    const repo = repoFalso();
    const r = await reativarNotificacoesSeNecessario({ navegador, repo, marca: marcaFalsa("ativa") });
    expect(r).toBe("reativou");
    expect(navegador.inscrever).toHaveBeenCalledOnce();
    expect(repo.salvar).toHaveBeenCalledExactlyOnceWith(INSCRICAO);
  });

  it("nunca pede a permissão (isso é do toque do Rafael)", async () => {
    const { navegador } = navegadorFalso();
    await reativarNotificacoesSeNecessario({ navegador, repo: repoFalso(), marca: marcaFalsa("ativa") });
    expect(navegador.pedirPermissao).not.toHaveBeenCalled();
  });

  it.each(["default", "denied"] as const)("permissão %s: não inscreve nem grava nada", async (permissao) => {
    const { navegador } = navegadorFalso({ permissao });
    const repo = repoFalso();
    expect(await reativarNotificacoesSeNecessario({ navegador, repo, marca: marcaFalsa("ativa") })).toBe("nada");
    expect(navegador.inscrever).not.toHaveBeenCalled();
    expect(repo.salvar).not.toHaveBeenCalled();
  });

  it("quem tocou em Desativar neste aparelho (marca desativada) nunca é reativado à força", async () => {
    const { navegador } = navegadorFalso();
    const repo = repoFalso();
    expect(await reativarNotificacoesSeNecessario({ navegador, repo, marca: marcaFalsa("desativada") })).toBe("nada");
    expect(repo.salvar).not.toHaveBeenCalled();
  });

  it("aparelho que nunca ativou aqui (sem marca): não inscreve sozinho, mesmo com a permissão dada", async () => {
    const { navegador } = navegadorFalso();
    const repo = repoFalso();
    expect(await reativarNotificacoesSeNecessario({ navegador, repo, marca: marcaFalsa(null) })).toBe("nada");
    expect(navegador.inscrever).not.toHaveBeenCalled();
  });

  it("já tem inscrição: nada a fazer, e o aparelho passa a lembrar que esteve ativado (quem ativou antes da correção também é coberto)", async () => {
    const { navegador } = navegadorFalso({ inscrito: true });
    const repo = repoFalso();
    const marca = marcaFalsa(null);
    expect(await reativarNotificacoesSeNecessario({ navegador, repo, marca })).toBe("nada");
    expect(repo.salvar).not.toHaveBeenCalled();
    expect(marca.atual()).toBe("ativa");
  });

  it("já tem inscrição e a marca dizia desativada (o Rafael reativou por fora): registra ativa", async () => {
    const { navegador } = navegadorFalso({ inscrito: true });
    const marca = marcaFalsa("desativada");
    await reativarNotificacoesSeNecessario({ navegador, repo: repoFalso(), marca });
    expect(marca.atual()).toBe("ativa");
  });

  it("sem conexão: não tenta nada (fica para a próxima abertura)", async () => {
    const { navegador } = navegadorFalso();
    const repo = repoFalso();
    expect(await reativarNotificacoesSeNecessario({ navegador, repo, marca: marcaFalsa("ativa"), online: () => false })).toBe("nada");
    expect(navegador.inscrever).not.toHaveBeenCalled();
    expect(repo.salvar).not.toHaveBeenCalled();
  });

  it("o navegador não consegue inscrever: falhou, sem gravar", async () => {
    const { navegador } = navegadorFalso({}, null);
    const repo = repoFalso();
    expect(await reativarNotificacoesSeNecessario({ navegador, repo, marca: marcaFalsa("ativa") })).toBe("falhou");
    expect(repo.salvar).not.toHaveBeenCalled();
  });

  it("o banco recusa: falhou e a inscrição solta do navegador é cancelada (nunca fica uma que o Cron não enxerga)", async () => {
    const { navegador, estado } = navegadorFalso();
    expect(await reativarNotificacoesSeNecessario({ navegador, repo: repoFalso(false), marca: marcaFalsa("ativa") })).toBe("falhou");
    expect(navegador.cancelar).toHaveBeenCalledOnce();
    expect(estado.inscrito).toBe(false);
  });

  it("nunca lança, mesmo se o navegador lançar", async () => {
    const { navegador } = navegadorFalso();
    navegador.ler.mockRejectedValueOnce(new Error("explodiu https://push.exemplo/segredo-do-endpoint"));
    await expect(reativarNotificacoesSeNecessario({ navegador, repo: repoFalso(), marca: marcaFalsa("ativa") })).resolves.toBe("falhou");
  });
});
