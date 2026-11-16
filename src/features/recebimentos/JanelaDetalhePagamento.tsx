"use client";

import { useEffect, useMemo, useState } from "react";
import { formatarDinheiro } from "@/domain/dinheiro";
import { formatarMes } from "@/domain/datas";
import {
  detalharPagamento,
  ehAjusteDeCentavos,
  type ResumoDoPagamento,
} from "@/domain/historico-pagamentos";
import {
  ROTULOS,
  TEXTOS_HISTORICO as T,
  juntarNomes,
  mensagem,
  rotuloDoModoELancamentos,
  rotuloMinhaParte,
  rotuloMudancaDeStatus,
  rotuloQuitou,
  rotuloRecebido,
  tituloDoPagamento,
} from "@/domain/mensagens";
import { nomeExibido } from "@/domain/painel";
import type { LinhaItemDePagamento, RepoPagamentos } from "@/data/pagamentos-repo";
import type { LinhaDe } from "@/data/realtime";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { classesPessoa } from "@/ui/cores-pessoa";
import { Janela } from "@/ui/Janela";
import { JanelaDesfazerPagamento } from "./JanelaDesfazerPagamento";

// Detalhe de um Pagamento (História 6.3, FR-29, UX-DR22): os Lançamentos que ele quitou, com o valor de
// cada item, o Status de antes e o aplicado (o item parcial não mudou o Status), e o botão "Desfazer
// pagamento", que abre a confirmação. É uma janela (como Gerar mensagem e Aplicar status), não o painel
// lateral do Lançamento: aqui não se edita nada e o texto precisa de espaço.
//
// - Os itens vêm do gerenciador (ao vivo); as linhas (nome, Mês, Responsável) são lidas uma vez ao abrir,
//   pelo repositório. Sem conexão a leitura falha com "Tentar de novo"; "Desfazer pagamento" fica
//   desativado (AD-3).
// - O valor mostrado é o RECEBIDO (`valor_recebido_centavos`); "Quitou" é Σ itens; em `minha_parte`,
//   "A minha parte" é a diferença.

type Linha = LinhaDe<"lancamentos">;
type Cadastro = { nome: string; cor: number };

export function JanelaDetalhePagamento({
  resumo,
  itens,
  responsaveis,
  statusNomes,
  online,
  repo,
  aoMudar,
  aoTrabalhar,
  aoDesfeito,
  aoJaDesfeito,
  aoFecharFoco,
}: {
  resumo: ResumoDoPagamento;
  /** Os itens vivos deste Pagamento. */
  itens: readonly LinhaItemDePagamento[];
  responsaveis: ReadonlyMap<string, Cadastro>;
  statusNomes: ReadonlyMap<string, string>;
  online: boolean;
  repo: Pick<RepoPagamentos, "linhasDoPagamento" | "previaDoDesfazer" | "desfazer">;
  aoMudar: (aberta: boolean) => void;
  aoTrabalhar: (trabalhando: boolean) => void;
  aoDesfeito: (valorRecebidoCentavos: number) => void;
  aoJaDesfeito: () => void;
  aoFecharFoco?: (evento: Event) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  // A leitura carrega a chave a que pertence: a de outros itens nunca vale para os atuais.
  const chave = useMemo(() => itens.map((i) => i.lancamento_id).sort().join(","), [itens]);
  const [guardada, setGuardada] = useState<{ chave: string; tentativa: number; linhas: Map<string, Linha> | null } | null>(null);

  useEffect(() => {
    let vale = true;
    void repo.linhasDoPagamento(chave === "" ? [] : chave.split(",")).then((lidas) => {
      if (vale) setGuardada({ chave, tentativa, linhas: lidas === null ? null : new Map(lidas.map((l) => [l.id, l])) });
    });
    return () => {
      vale = false;
    };
  }, [repo, chave, tentativa]);

  const lida = guardada !== null && guardada.chave === chave && guardada.tentativa === tentativa ? guardada : null;
  const { modo, valorRecebidoCentavos: recebido } = resumo;
  const totais = useMemo(() => detalharPagamento({ modo, valor_recebido_centavos: recebido }, itens, new Map()), [modo, recebido, itens]);
  const detalhe = useMemo(
    () => (lida?.linhas ? detalharPagamento({ modo, valor_recebido_centavos: recebido }, itens, lida.linhas) : null),
    [lida, modo, recebido, itens],
  );
  const ajustes = useMemo(
    () => new Set(detalhe === null ? [] : detalhe.linhas.filter((l) => l.ehAjuste).map((l) => l.item.lancamento_id)),
    [detalhe],
  );

  const nomesDosResponsaveis = resumo.responsaveis.map((r) => (r.id === null ? T.sem_responsavel : (responsaveis.get(r.id)?.nome ?? T.sem_responsavel)));
  const nomeDoStatus = (id: string | null) => (id === null ? null : (statusNomes.get(id) ?? null));

  return (
    <>
      <Janela
        aberta
        aoMudar={aoMudar}
        titulo={tituloDoPagamento(resumo.data)}
        descricao={`${juntarNomes(nomesDosResponsaveis)} · ${rotuloDoModoELancamentos(resumo.modo, resumo.quantidade)}`}
        aoFecharFoco={aoFecharFoco}
        rodape={
          <>
            <Botao variante="destrutivo" disabled={!online} onClick={() => setConfirmando(true)}>
              {T.desfazer}
            </Botao>
          </>
        }
      >
        <dl className="flex flex-wrap gap-x-6 gap-y-1 texto-body">
          <div>
            <dt className="sr-only">{T.titulo}</dt>
            <dd className="texto-body-strong">{rotuloRecebido(resumo.valorRecebidoCentavos)}</dd>
          </div>
          <div>
            <dd className="text-text-muted">{rotuloQuitou(totais.quitadoCentavos)}</dd>
          </div>
          {totais.minhaParteCentavos !== null ? (
            <div>
              <dd className="text-text-muted">{rotuloMinhaParte(totais.minhaParteCentavos)}</dd>
            </div>
          ) : null}
        </dl>
        {!online ? <p className="texto-body text-text-muted">{T.sem_internet}</p> : null}
        {lida === null ? (
          <p role="status" className="texto-body text-text-muted">
            {T.detalhe_carregando}
          </p>
        ) : detalhe === null ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="texto-body">{mensagem("carregar.falhou")}</p>
            <Botao variante="secundario" onClick={() => setTentativa((t) => t + 1)}>
              {ROTULOS.tentar_de_novo}
            </Botao>
          </div>
        ) : (
          <ul aria-label={T.detalhe_lancamentos} className="flex flex-col rounded-lg border border-border">
            {detalhe.linhas.map((l) => {
              const linha = l.linha;
              const responsavel = linha?.responsavel_id ? responsaveis.get(linha.responsavel_id) : undefined;
              const anterior = nomeDoStatus(l.item.status_anterior_id);
              const aplicado = nomeDoStatus(l.item.status_aplicado_id);
              return (
                <li
                  key={l.item.lancamento_id}
                  className="flex min-h-toque items-start justify-between gap-3 border-b border-border-subtle px-3 py-2 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="break-words texto-body-strong">
                      {linha === null ? T.sem_nome : nomeExibido(linha)}
                      {linha !== null && ehAjusteDeCentavos(linha) ? <span className="texto-caption text-text-muted"> · Ajuste de centavos</span> : null}
                    </p>
                    <p className="flex flex-wrap items-center gap-1.5 texto-caption text-text-muted">
                      {linha === null ? null : <span>{formatarMes(linha.mes)}</span>}
                      {responsavel === undefined ? null : (
                        <span className={cn("rounded-full px-2 texto-label", classesPessoa(responsavel.cor).etiqueta)}>{responsavel.nome}</span>
                      )}
                      {linha?.excluido_em ? <span>{T.excluido}</span> : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="texto-number">{formatarDinheiro(l.item.valor_centavos)}</p>
                    <p className="texto-caption text-text-muted">
                      {l.parcial ? T.parcial_sem_mudar : rotuloMudancaDeStatus(anterior, aplicado ?? "")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Janela>
      {confirmando ? (
        <JanelaDesfazerPagamento
          pagamentoId={resumo.id}
          valorRecebidoCentavos={resumo.valorRecebidoCentavos}
          data={resumo.data}
          ajustes={ajustes}
          online={online}
          repo={repo}
          aoMudar={(a) => {
            if (!a) setConfirmando(false);
          }}
          aoTrabalhar={aoTrabalhar}
          aoDesfeito={aoDesfeito}
          aoJaDesfeito={aoJaDesfeito}
        />
      ) : null}
    </>
  );
}
