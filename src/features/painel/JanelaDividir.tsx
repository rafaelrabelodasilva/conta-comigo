"use client";

import { useMemo, useState } from "react";
import {
  MAX_PARTES,
  avaliarRascunho,
  converterRascunho,
  lerDivisao,
  motivoParaNaoDividir,
  rascunhoDaDivisao,
  rascunhoInicial,
  type Divisao,
  type ModoDivisao,
  type ParteRascunho,
} from "@/domain/divisao";
import { arredondar, formatarDinheiro } from "@/domain/dinheiro";
import { opcoesDoCadastro } from "@/domain/lancamento";
import {
  ROTULOS,
  TEXTOS_DIVISAO as T,
  TEXTOS_LANCAMENTO,
  avisoDivisaoDaRegra,
  mensagem,
  rotuloDiferencaDeCentavos,
  rotuloSomaDasPartes,
} from "@/domain/mensagens";
import { nomeExibido } from "@/domain/painel";
import { ordenarParaConfiguracoes as ordenarResponsaveis } from "@/domain/responsaveis";
import { ordenarParaConfiguracoes as ordenarStatus } from "@/domain/status";
import type { LinhaLancamento } from "@/data/lancamentos-repo";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { Janela } from "@/ui/Janela";
import { Seletor } from "@/ui/Seletor";
import type { CadastrosPainel } from "./PainelLancamento";

// Janela "Dividir lançamento" (UX-DR15, mockup `dividir.html`): "Por valor /
// Por proporção", uma linha por parte (Responsável, fração ou valor, Valor
// calculado e Status próprio, padrão o do original), "＋ Parte" e o rodapé
// "Soma das partes: R$ 466,00 de R$ 466,00 ✓". "Dividir" só libera quando a
// soma bate (o núcleo, `avaliarRascunho`, decide). Num Lançamento já dividido
// a janela abre em modo de edição, com "Desfazer divisão", e mostra "Divisão
// aplicada pela Regra de NOME" quando ela veio de uma Regra. A gravação é de
// quem abre a janela (`aoDividir`, `aoDesfazer`), que a fecha quando dá certo.

export type PropsJanelaDividir = {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  /** A linha-mãe a dividir (ou já dividida). */
  linha: LinhaLancamento;
  /** As filhas não excluídas dela (modo edição): dão o Status de cada parte. */
  filhas: readonly LinhaLancamento[];
  /** A linha tem Ajuste de centavos vivo: não divide. */
  temAjuste: boolean;
  cadastros: Pick<CadastrosPainel, "responsaveis" | "status">;
  /** O Status padrão (`configuracoes`), para as partes novas. */
  statusPadraoId: string | null;
  /** Grava a Divisão e o Status de cada parte; devolve se deu certo. */
  aoDividir: (divisao: Divisao, status: readonly (string | null)[]) => Promise<boolean>;
  /** "Desfazer divisão"; devolve se deu certo. */
  aoDesfazer: () => Promise<boolean>;
};

const CAMPO =
  "min-h-toque w-full rounded-sm border border-border bg-background px-3 texto-body text-text placeholder:text-text-muted";
const COLUNAS = "grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.3fr)_44px] items-start gap-2";

function modoInicial(linha: LinhaLancamento): ModoDivisao {
  return lerDivisao(linha.divisao)?.modo ?? "proporcao";
}

export function JanelaDividir({
  aberta,
  aoMudar,
  linha,
  filhas,
  temAjuste,
  cadastros,
  statusPadraoId,
  aoDividir,
  aoDesfazer,
}: PropsJanelaDividir) {
  const divisaoAtual = lerDivisao(linha.divisao);
  const padrao = statusPadraoId ?? linha.status_id;
  const [modo, setModo] = useState<ModoDivisao>(() => modoInicial(linha));
  const [partes, setPartes] = useState<ParteRascunho[]>(() =>
    divisaoAtual
      ? rascunhoDaDivisao(linha.valor_centavos, divisaoAtual, new Map(filhas.map((f) => [f.id, f.status_id])), padrao)
      : rascunhoInicial(padrao),
  );
  const [trabalhando, setTrabalhando] = useState(false);

  const total = linha.valor_centavos;
  const avaliacao = useMemo(() => avaliarRascunho(total, modo, partes), [total, modo, partes]);
  const impedimento = divisaoAtual ? null : motivoParaNaoDividir(linha, temAjuste);
  const emEdicao = divisaoAtual !== null;
  const bate = avaliacao.erro === null;
  const podeGravar = bate && impedimento === null && !trabalhando;

  const responsaveis = ordenarResponsaveis(cadastros.responsaveis);
  const status = ordenarStatus(cadastros.status);

  const mudarParte = (i: number, mudanca: Partial<ParteRascunho>) => {
    setPartes((ps) => ps.map((p, j) => (j === i ? { ...p, ...mudanca } : p)));
  };

  const trocarModo = (novo: ModoDivisao) => {
    if (novo === modo) return;
    setPartes((ps) => converterRascunho(total, modo, ps));
    setModo(novo);
  };

  const incluirParte = () => {
    if (partes.length >= MAX_PARTES) return;
    setPartes((ps) => [...ps, { responsavel_id: null, texto: "", status_id: padrao }]);
  };

  async function gravar() {
    if (!podeGravar || avaliacao.divisao === null) return;
    setTrabalhando(true);
    const ok = await aoDividir(
      avaliacao.divisao,
      partes.map((p) => p.status_id),
    );
    setTrabalhando(false);
    if (ok) aoMudar(false);
  }

  async function desfazer() {
    if (trabalhando) return;
    setTrabalhando(true);
    const ok = await aoDesfazer();
    setTrabalhando(false);
    if (ok) aoMudar(false);
  }

  // A última parte leva os centavos que sobram: mostra quanto, quando houver.
  const ultima = partes.length - 1;
  const diferencaDaUltima = (() => {
    const valor = avaliacao.valores[ultima];
    const fracao = avaliacao.divisao?.partes[ultima];
    if (modo !== "proporcao" || valor === null || valor === undefined || !fracao) return 0;
    return valor - arredondar(total * fracao.numerador, fracao.denominador);
  })();

  // O ✓ é da soma; o Responsável que falta aparece na dica (e "Dividir" segue desativado).
  const somaBate = avaliacao.somaCentavos !== null && Math.abs(avaliacao.somaCentavos) === Math.abs(total);
  const somaTexto =
    avaliacao.somaCentavos === null ? T.fracoes_nao_fecham : rotuloSomaDasPartes(avaliacao.somaCentavos, total, somaBate);
  const dica =
    avaliacao.erro !== null && avaliacao.erro !== "divisao.soma_diferente" && avaliacao.erro !== "divisao.fracoes_invalidas"
      ? mensagem(avaliacao.erro)
      : null;

  return (
    <Janela
      aberta={aberta}
      aoMudar={aoMudar}
      titulo={T.titulo}
      descricao={`${nomeExibido(linha)} · ${formatarDinheiro(total)}`}
      className="max-w-3xl"
      rodape={
        <>
          {emEdicao ? (
            <Botao variante="destrutivo" className="mr-auto" disabled={trabalhando} onClick={() => void desfazer()}>
              {T.desfazer}
            </Botao>
          ) : null}
          <Botao onClick={() => aoMudar(false)}>{ROTULOS.cancelar}</Botao>
          <Botao variante="primario" disabled={!podeGravar} onClick={() => void gravar()}>
            {T.botao}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {divisaoAtual?.regra_chave ? (
          <p className="rounded-md border border-border bg-background px-3 py-2 texto-body text-text-muted">
            {avisoDivisaoDaRegra(divisaoAtual.regra_chave)}
          </p>
        ) : null}
        {impedimento ? <p className="texto-body text-danger-fg">{T[impedimento]}</p> : null}

        <div role="group" aria-label={T.modo} className="flex gap-2">
          {(["valor", "proporcao"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={modo === m}
              onClick={() => trocarModo(m)}
              className={cn(
                "min-h-toque cursor-pointer rounded-md border px-3.5 texto-body",
                modo === m ? "border-accent-line bg-selection text-text" : "border-border bg-transparent text-text-muted",
              )}
            >
              {m === "valor" ? T.por_valor : T.por_proporcao}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <div aria-hidden className={cn(COLUNAS, "texto-label text-text-muted")}>
            <span>{T.responsavel}</span>
            <span>{modo === "proporcao" ? T.fracao : T.valor}</span>
            <span className="text-right">{modo === "proporcao" ? T.valor : ""}</span>
            <span>{T.status}</span>
            <span />
          </div>
          {partes.map((p, i) => {
            const valor = avaliacao.valores[i];
            return (
              <div key={i} className={COLUNAS}>
                <Seletor
                  rotulo=""
                  aria-label={`${T.responsavel} ${i + 1}`}
                  className="mt-0"
                  value={p.responsavel_id ?? ""}
                  onChange={(e) => mudarParte(i, { responsavel_id: e.target.value === "" ? null : e.target.value })}
                  opcoes={opcoesDoCadastro(responsaveis, p.responsavel_id, T.sem_responsavel)}
                />
                <input
                  aria-label={`${modo === "proporcao" ? T.fracao : T.valor} ${i + 1}`}
                  inputMode={modo === "proporcao" ? "text" : "decimal"}
                  autoComplete="off"
                  placeholder={modo === "proporcao" ? "1/2" : "0,00"}
                  className={cn(CAMPO, "texto-number")}
                  value={p.texto}
                  onChange={(e) => mudarParte(i, { texto: e.target.value })}
                />
                <p className="flex min-h-toque flex-col items-end justify-center texto-number">
                  {modo === "proporcao" && valor !== null && valor !== undefined ? (
                    <>
                      <span>{formatarDinheiro(valor)}</span>
                      {i === ultima && diferencaDaUltima !== 0 ? (
                        <span className="texto-caption text-text-muted">{rotuloDiferencaDeCentavos(diferencaDaUltima)}</span>
                      ) : null}
                    </>
                  ) : null}
                </p>
                <Seletor
                  rotulo=""
                  aria-label={`${T.status} ${i + 1}`}
                  value={p.status_id ?? ""}
                  onChange={(e) => mudarParte(i, { status_id: e.target.value === "" ? null : e.target.value })}
                  opcoes={opcoesDoCadastro(status, p.status_id, TEXTOS_LANCAMENTO.sem_status)}
                />
                {partes.length > 2 ? (
                  <button
                    type="button"
                    aria-label={`${T.remover_parte} ${i + 1}`}
                    onClick={() => setPartes((ps) => ps.filter((_, j) => j !== i))}
                    className="area-toque inline-flex size-icone cursor-pointer items-center justify-center rounded-sm text-text-muted"
                  >
                    <span aria-hidden>✕</span>
                  </button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>

        <div>
          <Botao tamanho="compacto" disabled={partes.length >= MAX_PARTES} onClick={incluirParte}>
            {T.parte}
          </Botao>
        </div>

        <div role="status" className="rounded-md bg-background p-2.5 texto-body">
          <span className={somaBate ? "text-status-paid-fg" : "text-text"}>{somaTexto}</span>
          {dica ? <p className="texto-caption text-text-muted">{dica}</p> : null}
        </div>
      </div>
    </Janela>
  );
}
