"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { arquivadosNaFormula, lerBlocos, planejarMarcasDoBloco, type Bloco, type MarcasDoBloco } from "@/domain/blocos";
import { textoDaFormula } from "@/domain/formula";
import {
  ROTULOS,
  TEXTOS_BLOCO,
  TEXTOS_COBRANCA as T,
  avisoCadastrosArquivados,
  mensagem,
  rotuloEMeuBloco,
  rotuloUsarEmRecebimentos,
} from "@/domain/mensagens";
import { repoBlocos } from "@/data/blocos-repo";
import { gerenciador, useLinhas } from "@/data/realtime";
import { Botao } from "@/ui/Botao";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { Interruptor } from "@/ui/Interruptor";
import { useToast } from "@/ui/Toast";

// Configurações → Blocos de cobrança (História 6.5, FR-26, FR-31, UX-DR25): a lista dos Blocos com duas chaves
// cada um, "Usar em Recebimentos" (vira cartão em Recebimentos) e "É o meu Bloco" (único: o do gasto do Rafael por
// Tipo, Épico 7; marcar um tira a marca do outro, na mesma gravação). É um editor das duas marcas, não do Bloco:
// o nome e a Fórmula continuam no Montador do Painel (a lista só os mostra). Lê só pelo gerenciador de Realtime e
// grava só por `repoBlocos().salvar` (a RPC `salvar_bloco`, que o Montador também usa); o pedido vem do núcleo
// (`planejarMarcasDoBloco`). Uma gravação por vez por Bloco; sem conexão o repositório recusa (AD-3).

export function SecaoBlocosDeCobranca() {
  const blocosLidos = useLinhas("blocos");
  const responsaveis = useLinhas("responsaveis");
  const tipos = useLinhas("tipos");
  const toast = useToast();
  const [salvando, setSalvando] = useState<string | null>(null);

  const blocos = useMemo(() => lerBlocos(blocosLidos.linhas), [blocosLidos.linhas]);
  const nomes = useMemo(
    () => ({
      responsaveis: new Map(responsaveis.linhas.map((r) => [r.id, r.nome])),
      tipos: new Map(tipos.linhas.map((t) => [t.id, t.nome])),
    }),
    [responsaveis.linhas, tipos.linhas],
  );

  async function marcar(bloco: Bloco, mudanca: Partial<MarcasDoBloco>) {
    setSalvando(bloco.id);
    const r = await repoBlocos().salvar(planejarMarcasDoBloco(bloco, mudanca));
    setSalvando(null);
    if (!r.ok) toast.mostrar({ texto: mensagem(r.codigo) });
  }

  let conteudo;
  if (blocosLidos.status === "erro") {
    conteudo = <ErroAoCarregar aoTentarDeNovo={() => void gerenciador("blocos").recarregar()} />;
  } else if (blocosLidos.status !== "pronto") {
    conteudo = (
      <div role="status" aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">{T.carregando}</span>
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-toque" />
        ))}
      </div>
    );
  } else if (blocos.length === 0) {
    conteudo = (
      <EstadoVazio
        texto={T.sem_blocos}
        acao={
          <Botao asChild>
            <Link href="/">{T.criar_no_painel}</Link>
          </Botao>
        }
      />
    );
  } else {
    conteudo = (
      <ul aria-label={T.lista} className="flex flex-col rounded-md border border-border">
        {blocos.map((b) => {
          const arquivados = arquivadosNaFormula(b.formula, { responsaveis: responsaveis.linhas, tipos: tipos.linhas });
          return (
            <li
              key={b.id}
              className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border-subtle px-3 py-2 last:border-b-0"
            >
              <div className="flex min-w-48 flex-1 flex-col">
                <span className="texto-body-strong">{b.nome}</span>
                <span className="texto-caption text-text-muted">{textoDaFormula(b.formula, nomes)}</span>
                {arquivados.length > 0 ? (
                  <span className="texto-caption text-text-muted">{avisoCadastrosArquivados(arquivados)}</span>
                ) : null}
              </div>
              <fieldset disabled={salvando === b.id} className="flex flex-wrap gap-x-5">
                <legend className="sr-only">{b.nome}</legend>
                <Interruptor
                  rotulo={TEXTOS_BLOCO.usar_em_recebimentos}
                  nomeAcessivel={rotuloUsarEmRecebimentos(b.nome)}
                  ligado={b.de_cobranca}
                  aoMudar={(ligado) => void marcar(b, { de_cobranca: ligado })}
                />
                <Interruptor
                  rotulo={TEXTOS_BLOCO.meu_bloco}
                  nomeAcessivel={rotuloEMeuBloco(b.nome)}
                  ligado={b.meu_bloco}
                  aoMudar={(ligado) => void marcar(b, { meu_bloco: ligado })}
                />
              </fieldset>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section aria-labelledby="titulo-cobranca" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      <header className="flex flex-col gap-1">
        <h2 id="titulo-cobranca" className="texto-body-strong">
          {ROTULOS.blocos_de_cobranca}
        </h2>
        <p className="texto-caption text-text-muted">{T.ajuda}</p>
      </header>
      {conteudo}
    </section>
  );
}
