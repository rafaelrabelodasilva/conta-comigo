"use client";

import { useState } from "react";
import { formatarData } from "@/domain/datas";
import { formatarDinheiro } from "@/domain/dinheiro";
import { formatarParcela } from "@/domain/importacao-fatura";
import {
  COLUNAS_LANCAMENTOS as C,
  TEXTOS_IMPORTAR,
  mensagem,
  rotuloDespesasCreditos,
  tituloFaturaImportada,
} from "@/domain/mensagens";
import type { LinhaFatura, LinhaLancamento } from "@/data/faturas-repo";
import { gerenciador, useLinhas } from "@/data/realtime";
import { ImportarFatura } from "@/features/importar/ImportarFatura";
import { TotalAPagar } from "@/features/importar/TotalAPagar";
import { Botao } from "@/ui/Botao";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { Tela } from "@/ui/Tela";

// Painel provisório (decisão do Rafael, 03/11/2026), até a grade da 2.4:
// "＋ Importar fatura" no topo, um cartão por Fatura importada e uma lista
// simples dos Lançamentos na ordem da fatura. Tudo vem dos gerenciadores de
// Realtime: uma importação (deste ou de outro aparelho) aparece sem recarregar.

/** Faturas do Mês mais novo para o mais antigo. */
function ordenarFaturas(faturas: readonly LinhaFatura[]): LinhaFatura[] {
  return [...faturas].sort((a, b) => (a.mes < b.mes ? 1 : a.mes > b.mes ? -1 : 0));
}

/** Mês mais novo primeiro; dentro do Mês, a ordem da fatura (sem ordem no fim). */
function ordenarLancamentos(linhas: readonly LinhaLancamento[]): LinhaLancamento[] {
  return linhas
    .filter((l) => l.excluido_em === null)
    .sort((a, b) => {
      if (a.mes !== b.mes) return a.mes < b.mes ? 1 : -1;
      return (a.ordem_fatura ?? Number.MAX_SAFE_INTEGER) - (b.ordem_fatura ?? Number.MAX_SAFE_INTEGER);
    });
}

function BotaoImportar({ aoImportar }: { aoImportar: () => void }) {
  return (
    <Botao variante="primario" onClick={aoImportar}>
      <span aria-hidden>＋</span>
      {TEXTOS_IMPORTAR.botao}
    </Botao>
  );
}

export function Painel({ titulo }: { titulo: string }) {
  const [importando, setImportando] = useState(false);
  const faturas = useLinhas("faturas");
  const lancamentos = useLinhas("lancamentos");
  const abrir = () => setImportando(true);

  let conteudo;
  if (faturas.status === "erro" || lancamentos.status === "erro") {
    conteudo = (
      <ErroAoCarregar
        aoTentarDeNovo={() => {
          void gerenciador("faturas").recarregar();
          void gerenciador("lancamentos").recarregar();
        }}
      />
    );
  } else if (faturas.status === "carregando" || lancamentos.status === "carregando") {
    conteudo = (
      <div className="flex flex-col gap-3">
        <Esqueleto className="h-24" />
        <Esqueleto className="h-64" />
      </div>
    );
  } else if (faturas.linhas.length === 0) {
    conteudo = <EstadoVazio texto={mensagem("painel.vazio")} />;
  } else {
    const linhas = ordenarLancamentos(lancamentos.linhas);
    conteudo = (
      <div className="flex flex-col gap-3">
        {ordenarFaturas(faturas.linhas).map((f) => {
          const daFatura = linhas.filter((l) => l.fatura_id === f.id);
          return (
            <section key={f.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
              <h2 className="texto-body-strong">{tituloFaturaImportada(f.mes, f.vencimento, daFatura.length)}</h2>
              <TotalAPagar fatura={f} valoresCentavos={daFatura.map((l) => l.valor_centavos)} />
              <p className="texto-number text-text-muted">
                {rotuloDespesasCreditos(f.total_despesas_centavos, f.total_creditos_centavos)}
              </p>
            </section>
          );
        })}
        <section className="overflow-x-auto rounded-lg border border-border bg-surface p-3">
          <table className="w-full texto-body">
            <caption className="pb-2 text-left texto-body-strong">{C.titulo}</caption>
            <thead>
              <tr className="text-left text-text-muted">
                <th className="py-1 pr-3">{C.data}</th>
                <th className="py-1 pr-3">{C.nome}</th>
                <th className="py-1 pr-3">{C.parcela}</th>
                <th className="py-1 pr-3 text-right">{C.valor}</th>
                <th className="py-1">{C.cartao}</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-t border-border-subtle">
                  <td className="py-1 pr-3 texto-number">{l.data ? formatarData(l.data) : ""}</td>
                  <td className="py-1 pr-3">{l.nome}</td>
                  <td className="py-1 pr-3 texto-number">{formatarParcela(l.parcela_n, l.parcela_total)}</td>
                  <td className="py-1 pr-3 text-right texto-number">{formatarDinheiro(l.valor_centavos)}</td>
                  <td className="py-1 texto-number">{l.final_cartao ?? ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border texto-body-strong">
                <td className="py-1 pr-3" colSpan={3}>
                  {C.total}
                </td>
                <td className="py-1 pr-3 text-right texto-number">
                  {formatarDinheiro(linhas.reduce((soma, l) => soma + l.valor_centavos, 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </section>
      </div>
    );
  }

  return (
    <Tela titulo={titulo} acoes={<BotaoImportar aoImportar={abrir} />}>
      {conteudo}
      <ImportarFatura aberta={importando} aoMudar={setImportando} />
    </Tela>
  );
}
