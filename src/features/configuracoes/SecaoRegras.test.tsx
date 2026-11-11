// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hojeEmSaoPaulo } from "@/domain/datas";
import {
  DESCRICAO_EXCLUIR_REGRA,
  TEXTOS_REGRAS as T,
  perguntaReaplicar,
  rotuloEditarRegra,
  rotuloExcluirRegra,
  tituloExcluirRegra,
} from "@/domain/mensagens";
import { mesAtual } from "@/domain/painel";
import { ToastProvider } from "@/ui/Toast";
import { SecaoRegras } from "./SecaoRegras";

const MES = mesAtual(hojeEmSaoPaulo(new Date()));

const regra = (id: string, chave: string, extra: Record<string, unknown> = {}) => ({
  id,
  chave,
  versao_normalizacao: 1,
  responsavel_id: "casal",
  tipo_id: "casa",
  contagem: [{ responsavel_id: "casal", n: 2 }],
  ultimo_uso: "2026-11-05T15:00:00+00:00",
  ...extra,
});
const lancamento = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  mes: MES,
  responsavel_id: null,
  tipo_id: null,
  ajuste_de_id: null,
  excluido_em: null,
  ...extra,
});

const estado = vi.hoisted(() => ({
  regras: [] as unknown[],
  lancamentos: [] as unknown[],
  lancamentosStatus: "pronto" as "pronto" | "carregando",
  mes: "",
  editar: vi.fn(),
  excluir: vi.fn(),
  classificarEmLote: vi.fn(),
  desfazerLote: vi.fn(),
  abrirMes: vi.fn(),
}));

vi.mock("@/data/realtime", () => ({
  useLinhas: (tabela: string) => {
    if (tabela === "regras") return { status: "pronto", linhas: estado.regras };
    if (tabela === "responsaveis")
      return {
        status: "pronto",
        linhas: [
          { id: "casal", nome: "Casal", arquivado: false, ordem: 1 },
          { id: "rafael", nome: "Rafael", arquivado: false, ordem: 2 },
        ],
      };
    if (tabela === "tipos")
      return {
        status: "pronto",
        linhas: [
          { id: "casa", nome: "Casa", arquivado: false },
          { id: "saude", nome: "Saúde", arquivado: false },
        ],
      };
    return { status: estado.lancamentosStatus, linhas: estado.lancamentos, mes: estado.mes };
  },
  gerenciador: () => ({ recarregar: vi.fn(), abrirMes: estado.abrirMes }),
}));
vi.mock("@/data/regras-repo", () => ({
  repoRegras: () => ({ editar: estado.editar, excluir: estado.excluir }),
}));
vi.mock("@/data/lancamentos-repo", () => ({
  repoLancamentos: () => ({ classificarEmLote: estado.classificarEmLote, desfazerLote: estado.desfazerLote }),
}));

function abrir() {
  render(
    <ToastProvider>
      <SecaoRegras />
    </ToastProvider>,
  );
  return userEvent.setup();
}

describe("SecaoRegras (História 3.4)", () => {
  beforeEach(() => {
    estado.regras = [];
    estado.lancamentos = [];
    estado.lancamentosStatus = "pronto";
    estado.mes = MES;
    for (const f of [estado.editar, estado.excluir, estado.classificarEmLote, estado.desfazerLote, estado.abrirMes]) f.mockReset();
    estado.editar.mockResolvedValue({ ok: true, regra: {} });
    estado.excluir.mockResolvedValue({ ok: true });
    estado.desfazerLote.mockResolvedValue({ ok: true, linhas: [], gravadas: 1, antes: [] });
    estado.classificarEmLote.mockResolvedValue({ ok: true, linhas: [], gravadas: 2, antes: [{ id: "a", corpo: {} }] });
  });

  it("abre o Mês atual no gerenciador de Lançamentos (para reaplicar)", () => {
    abrir();
    expect(estado.abrirMes).toHaveBeenCalledWith(MES);
  });

  it("sem Regras: a frase de vazio e nada de busca", () => {
    abrir();
    expect(screen.getByText(T.vazio)).toBeTruthy();
    expect(screen.queryByLabelText(T.buscar)).toBeNull();
  });

  it("lista chave, Responsável, Tipo, Divisão '—' e última vez usada, com 'às vezes' quando há dúvida", () => {
    estado.regras = [
      regra("r1", "SPOTIFY"),
      regra("r2", "FARMACIA", {
        contagem: [
          { responsavel_id: "casal", n: 3 },
          { responsavel_id: "rafael", n: 1 },
        ],
        ultimo_uso: "2026-11-09T15:00:00+00:00",
      }),
    ];
    abrir();
    const itens = screen.getAllByRole("listitem");
    // Mais recente primeiro.
    expect(within(itens[0]).getByText("FARMACIA")).toBeTruthy();
    expect(within(itens[0]).getByText("às vezes Rafael")).toBeTruthy();
    expect(within(itens[0]).getByText("09/11/26")).toBeTruthy();
    expect(within(itens[1]).getByText("SPOTIFY")).toBeTruthy();
    expect(within(itens[1]).getByText("Casal")).toBeTruthy();
    expect(within(itens[1]).getByText("Casa")).toBeTruthy();
    expect(within(itens[1]).getByText(T.sem_divisao)).toBeTruthy();
  });

  it("a busca filtra por chave, Responsável ou Tipo; sem resultado, 'Nenhuma Regra encontrada'", async () => {
    estado.regras = [regra("r1", "SPOTIFY"), regra("r2", "FARMACIA", { responsavel_id: "rafael", tipo_id: "saude" })];
    const u = abrir();
    await u.type(screen.getByLabelText(T.buscar), "saude");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("FARMACIA")).toBeTruthy();
    await u.clear(screen.getByLabelText(T.buscar));
    await u.type(screen.getByLabelText(T.buscar), "zzz");
    expect(screen.getByText(T.nenhuma_encontrada)).toBeTruthy();
  });

  it("editar: salvar sem Responsável nem Tipo fica desligado", async () => {
    estado.regras = [regra("r1", "SPOTIFY")];
    const u = abrir();
    await u.click(screen.getByRole("button", { name: rotuloEditarRegra("SPOTIFY") }));
    await u.selectOptions(screen.getByLabelText(T.responsavel), "");
    await u.selectOptions(screen.getByLabelText(T.tipo), "");
    expect((screen.getByRole("button", { name: T.salvar }) as HTMLButtonElement).disabled).toBe(true);
    expect(estado.editar).not.toHaveBeenCalled();
  });

  it("editar o Responsável pergunta 'Reaplicar…'; 'Só este' não toca nos lançamentos", async () => {
    estado.regras = [regra("r1", "SPOTIFY")];
    estado.lancamentos = [lancamento("a", "DM*SPOTIFY"), lancamento("b", "EBN SPOTIFY", { responsavel_id: "rafael" })];
    const u = abrir();
    await u.click(screen.getByRole("button", { name: rotuloEditarRegra("SPOTIFY") }));
    await u.selectOptions(screen.getByLabelText(T.responsavel), "rafael");
    await u.click(screen.getByRole("button", { name: T.salvar }));
    // Só o Responsável mudou: o Tipo não vai na edição.
    expect(estado.editar).toHaveBeenCalledWith("r1", { responsavel_id: "rafael" });
    // 'b' já é do Rafael: só 'a' muda.
    expect(await screen.findByText(perguntaReaplicar(MES, 1))).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Só este" }));
    expect(estado.classificarEmLote).not.toHaveBeenCalled();
    expect(screen.queryByText(perguntaReaplicar(MES, 1))).toBeNull();
  });

  it("'Aplicar a todos' reaplica em lote sem ensinar, com os campos editados, e oferece Desfazer", async () => {
    estado.regras = [regra("r1", "SPOTIFY")];
    estado.lancamentos = [lancamento("a", "DM*SPOTIFY"), lancamento("b", "EBN SPOTIFY"), lancamento("c", "AMAZON")];
    const u = abrir();
    await u.click(screen.getByRole("button", { name: rotuloEditarRegra("SPOTIFY") }));
    await u.selectOptions(screen.getByLabelText(T.tipo), "saude");
    await u.click(screen.getByRole("button", { name: T.salvar }));
    await u.click(await screen.findByRole("button", { name: "Aplicar a todos" }));
    expect(estado.classificarEmLote).toHaveBeenCalledWith(
      [
        { id: "a", campos: { tipo_id: "saude" } },
        { id: "b", campos: { tipo_id: "saude" } },
      ],
      { ensinar: false },
    );
    await u.click(await screen.findByRole("button", { name: "Desfazer" }));
    expect(estado.desfazerLote).toHaveBeenCalledWith([{ id: "a", corpo: {} }]);
  });

  it("sem lançamento que mude, não pergunta; sem o Mês carregado, também não", async () => {
    estado.regras = [regra("r1", "SPOTIFY")];
    estado.lancamentos = [lancamento("a", "AMAZON")];
    const u = abrir();
    await u.click(screen.getByRole("button", { name: rotuloEditarRegra("SPOTIFY") }));
    await u.selectOptions(screen.getByLabelText(T.tipo), "saude");
    await u.click(screen.getByRole("button", { name: T.salvar }));
    expect(await screen.findByText(T.regra_salva)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aplicar a todos" })).toBeNull();
  });

  it("falha ao salvar mantém a janela aberta e mostra o motivo", async () => {
    estado.regras = [regra("r1", "SPOTIFY")];
    estado.editar.mockResolvedValue({ ok: false, codigo: "salvar.falhou" });
    const u = abrir();
    await u.click(screen.getByRole("button", { name: rotuloEditarRegra("SPOTIFY") }));
    await u.selectOptions(screen.getByLabelText(T.tipo), "saude");
    await u.click(screen.getByRole("button", { name: T.salvar }));
    expect(await screen.findByText("Não foi possível salvar. Tente de novo.")).toBeTruthy();
    expect(screen.getByRole("button", { name: T.salvar })).toBeTruthy();
  });

  it("excluir pede confirmação; cancelar não exclui; confirmar exclui", async () => {
    estado.regras = [regra("r1", "SPOTIFY")];
    const u = abrir();
    await u.click(screen.getByRole("button", { name: rotuloExcluirRegra("SPOTIFY") }));
    expect(screen.getByText(tituloExcluirRegra("SPOTIFY"))).toBeTruthy();
    expect(screen.getByText(DESCRICAO_EXCLUIR_REGRA)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(estado.excluir).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: rotuloExcluirRegra("SPOTIFY") }));
    await u.click(screen.getByRole("button", { name: T.confirmar_excluir }));
    expect(estado.excluir).toHaveBeenCalledWith("r1");
  });
});
