// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TEXTOS_REVISAR as T, rotuloConfirmarItem, rotuloMudarItem } from "@/domain/mensagens";
import { montarFila, type CadastrosDaFila, type ItemDaFila, type LinhaDaFila } from "@/domain/revisar";
import { COLUNAS_ITEM_REVISAR, ItemRevisar } from "./ItemRevisar";

const cadastros: CadastrosDaFila = {
  responsaveis: [
    { id: "casal", nome: "Casal", arquivado: false },
    { id: "rafael", nome: "Rafael", arquivado: false },
  ],
  tipos: [
    { id: "casa", nome: "Casa", arquivado: false },
    { id: "saude", nome: "Saúde", arquivado: false },
    { id: "gatos", nome: "Gatos", arquivado: false },
  ],
};

function item(extra: Partial<LinhaDaFila> = {}, outras: LinhaDaFila[] = []): ItemDaFila {
  const l: LinhaDaFila = {
    id: "a",
    nome: "SHOPEE TESHOPVENTION",
    apelido: null,
    mes: "2026-11",
    valor_centavos: 6970,
    parcela_n: null,
    parcela_total: null,
    responsavel_id: null,
    tipo_id: null,
    ajuste_de_id: null,
    excluido_em: null,
    revisao_motivo: "sem_classificacao",
    revisao_dados: null,
    ordem_fatura: 1,
    ...extra,
  };
  return montarFila([l, ...outras], cadastros)[0].itens[0];
}

function desenhar(i: ItemDaFila, extras: { comMes?: boolean; ocupado?: boolean } = {}) {
  const aoConfirmar = vi.fn();
  const aoMudar = vi.fn();
  render(
    <ul>
      <ItemRevisar item={i} comMes={extras.comMes ?? false} ocupado={extras.ocupado} aoConfirmar={aoConfirmar} aoMudar={aoMudar} />
    </ul>,
  );
  return { aoConfirmar, aoMudar };
}

const sugestao = { responsavel_id: "casal", tipo_id: "casa", outros_responsaveis: [] as string[] };

describe("ItemRevisar", () => {
  it("é um review-item de 64 pt com as colunas fixas 30 / 1fr / 210 / 84 / 104", () => {
    desenhar(item());
    const linha = screen.getByRole("listitem");
    expect(linha.className).toContain("min-h-16");
    expect(linha.className).toContain(COLUNAS_ITEM_REVISAR);
    expect(COLUNAS_ITEM_REVISAR).toBe("grid-cols-[30px_minmax(0,1fr)_210px_84px_104px]");
    // A 1ª coluna (lote da 3.3) existe e está vazia; sobram Nome, sugestão, ✓ e Mudar.
    expect(linha.children).toHaveLength(5);
    expect(linha.children[0].textContent).toBe("");
  });

  it("sugestão: 'Sugestão' + 'Casal · Casa', ✓ e Mudar com 44 pt de toque", async () => {
    const { aoConfirmar, aoMudar } = desenhar(item({ revisao_motivo: "sugestao", revisao_dados: sugestao }));
    expect(screen.getByText("SHOPEE TESHOPVENTION")).toBeTruthy();
    expect(screen.getByText("Sugestão")).toBeTruthy();
    expect(screen.getByText("Casal · Casa")).toBeTruthy();
    const ok = screen.getByRole("button", { name: rotuloConfirmarItem("SHOPEE TESHOPVENTION") });
    const mudar = screen.getByRole("button", { name: rotuloMudarItem("SHOPEE TESHOPVENTION") });
    expect(ok.className).toContain("size-11");
    expect(mudar.className).toContain("min-h-toque");
    expect(mudar.textContent).toBe(T.mudar);
    const u = userEvent.setup();
    await u.click(ok);
    await u.click(mudar);
    expect(aoConfirmar).toHaveBeenCalledOnce();
    expect(aoConfirmar.mock.calls[0][0].id).toBe("a");
    expect(aoMudar).toHaveBeenCalledOnce();
  });

  it("com dúvida: 'Casal · Saúde' e 'às vezes Rafael'", () => {
    desenhar(
      item({
        revisao_motivo: "sugestao_duvida",
        revisao_dados: { responsavel_id: "casal", tipo_id: "saude", outros_responsaveis: ["rafael"] },
      }),
    );
    expect(screen.getByText("Casal · Saúde")).toBeTruthy();
    expect(screen.getByText("às vezes Rafael")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Confirmar sugestão/ })).toBeTruthy();
  });

  it("só Tipo sugerido: 'Gatos', sem ✓, só Mudar", () => {
    desenhar(item({ revisao_motivo: "sugestao", revisao_dados: { responsavel_id: null, tipo_id: "gatos", outros_responsaveis: [] } }));
    expect(screen.getByText("Gatos")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Confirmar/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Mudar/ })).toBeTruthy();
  });

  it("sem sugestão: 'Sem sugestão', sem ✓", () => {
    desenhar(item());
    expect(screen.getByText(T.sem_sugestao)).toBeTruthy();
    expect(screen.queryByText("Sugestão")).toBeNull();
    expect(screen.queryByRole("button", { name: /Confirmar/ })).toBeNull();
  });

  it("detalhe: parcela e valor; com mais de um Mês, o Mês antes; o Apelido no lugar do Nome", () => {
    desenhar(item({ apelido: "Lava e seca", nome: "MAGALU", parcela_n: 5, parcela_total: 10, valor_centavos: 44589 }), {
      comMes: true,
    });
    expect(screen.getByText("Lava e seca")).toBeTruthy();
    expect(screen.getByText("Nov/26 · 05/10 · R$ 445,89", { normalizer: (t) => t.replaceAll("\u00a0", " ") })).toBeTruthy();
  });

  it("os Ajustes da mãe aparecem como linhas menores, sem botão próprio", () => {
    const mae = item(
      { id: "msc", nome: "MSC CRUZEIROS", revisao_motivo: "sugestao", revisao_dados: sugestao },
      [
        {
          id: "aj",
          nome: "MSC CRUZEIROS",
          apelido: null,
          mes: "2026-11",
          valor_centavos: -8,
          parcela_n: null,
          parcela_total: null,
          responsavel_id: "casal",
          tipo_id: "casa",
          ajuste_de_id: "msc",
          excluido_em: null,
          revisao_motivo: null,
          revisao_dados: null,
          ordem_fatura: 2,
        },
      ],
    );
    desenhar(mae);
    const ajuste = document.querySelector("[data-ajuste]")!;
    expect(ajuste.textContent?.replaceAll("\u00a0", " ")).toContain("Ajuste - R$ 0,08");
    expect(within(screen.getByRole("listitem")).getAllByRole("button")).toHaveLength(2);
  });

  it("gravando: os dois botões ficam desligados", () => {
    desenhar(item({ revisao_motivo: "sugestao", revisao_dados: sugestao }), { ocupado: true });
    for (const b of screen.getAllByRole("button")) expect(b.hasAttribute("disabled")).toBe(true);
  });
});
