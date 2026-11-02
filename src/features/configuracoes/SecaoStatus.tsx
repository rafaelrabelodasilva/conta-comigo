"use client";

import { useCallback, useEffect, useState } from "react";
import { opcoesDeSubstituto } from "@/domain/cadastros";
import { ROTULOS, mensagem } from "@/domain/mensagens";
import {
  ativos,
  ordenarParaConfiguracoes,
  padraoVigente,
  validarArquivarStatus,
  validarDesarquivarStatus,
  validarNomeStatus,
} from "@/domain/status";
import { repoCadastros } from "@/data/cadastros-repo";
import { configuracoesDoDono, repoConfiguracoes } from "@/data/configuracoes-repo";
import { gerenciador, useLinhas } from "@/data/realtime";
import { repoStatus, type ResultadoGravacao } from "@/data/status-repo";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { Seletor } from "@/ui/Seletor";
import { useToast } from "@/ui/Toast";
import { useExcluirCadastro } from "./ExcluirCadastro";
import { LinhaStatus } from "./LinhaStatus";

// Configurações → Status. Lê só pelos hooks do gerenciador de Realtime
// (`status` e `configuracoes`) e grava só pelos repositórios; as regras vêm
// do núcleo. Acima da lista, o Status padrão das linhas novas. A contagem de
// uso é lida ao abrir a seção e depois de excluir (não é tempo real).

export function SecaoStatus() {
  const { status, linhas } = useLinhas("status");
  const config = useLinhas("configuracoes");
  const toast = useToast();
  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [usos, setUsos] = useState<ReadonlyMap<string, number> | null>(null);

  const repo = repoStatus();
  const lista = ordenarParaConfiguracoes(linhas);
  const padraoId = configuracoesDoDono(config.linhas)?.status_padrao_id ?? null;
  const prontos = status === "pronto" && config.status === "pronto";

  const contar = useCallback(() => {
    void repoCadastros()
      .contarUsos("status")
      .then((r) => {
        if (r.ok) setUsos(r.valor);
      });
  }, []);

  // Contagem ao abrir a seção (a resposta chega num callback).
  useEffect(() => {
    let ativo = true;
    void repoCadastros()
      .contarUsos("status")
      .then((r) => {
        if (ativo && r.ok) setUsos(r.valor);
      });
    return () => {
      ativo = false;
    };
  }, []);

  function avisarSeFalhou(r: ResultadoGravacao) {
    if (!r.ok) toast.mostrar({ texto: mensagem("salvar.falhou") });
  }

  async function adicionar() {
    const nome = validarNomeStatus(nomeNovo, linhas);
    if (!nome.ok) {
      setErroNovo(mensagem(nome.erro.codigo));
      return;
    }
    setSalvandoNovo(true);
    const r = await repo.criar({ nome: nome.valor });
    setSalvandoNovo(false);
    if (!r.ok) {
      avisarSeFalhou(r);
      return;
    }
    setNomeNovo("");
    setErroNovo(null);
    setCriando(false);
  }

  function cancelarNovo() {
    setCriando(false);
    setNomeNovo("");
    setErroNovo(null);
  }

  async function arquivar(id: string) {
    const alvo = linhas.find((s) => s.id === id);
    if (!alvo) return;
    // O Status padrão não pode sumir das escolhas.
    const r = validarArquivarStatus(alvo, padraoId);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.erro.codigo) });
      return;
    }
    avisarSeFalhou(await repo.arquivar(id));
  }

  async function desarquivar(id: string) {
    const r = validarDesarquivarStatus(linhas, id);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.erro.codigo) });
      return;
    }
    avisarSeFalhou(await repo.desarquivar(id));
  }

  const exclusao = useExcluirCadastro({
    cadastro: "status",
    opcoes: (deId) => opcoesDeSubstituto(ativos(linhas), deId),
    aoArquivar: (id) => void arquivar(id),
    aoExcluir: contar,
  });

  let conteudo;
  if (status === "erro" || config.status === "erro") {
    conteudo = (
      <ErroAoCarregar
        aoTentarDeNovo={() => {
          void gerenciador("status").recarregar();
          void gerenciador("configuracoes").recarregar();
          contar();
        }}
      />
    );
  } else if (!prontos) {
    conteudo = (
      <div className="flex flex-col gap-2 p-2" aria-busy>
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-toque" />
        ))}
      </div>
    );
  } else if (lista.length === 0 && !criando) {
    conteudo = <EstadoVazio texto={mensagem("status.lista_vazia")} />;
  } else {
    conteudo = (
      <ul className="flex flex-col">
        {lista.map((s) => (
          <LinhaStatus
            key={s.id}
            status={s}
            todos={linhas}
            usos={usos === null ? null : (usos.get(s.id) ?? 0)}
            aoRenomear={async (id, nome) => avisarSeFalhou(await repo.atualizar(id, { nome }))}
            aoMudarContaComoPago={async (id, valor) =>
              avisarSeFalhou(await repo.definirContaComoPago(id, valor))
            }
            aoArquivar={arquivar}
            aoDesarquivar={desarquivar}
            aoExcluir={(id) => void exclusao.pedir({ id, nome: s.nome })}
          />
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="titulo-status" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      <header className="flex flex-wrap items-center gap-3">
        <h2 id="titulo-status" className="flex-1 texto-body-strong">
          {ROTULOS.status}
        </h2>
        <Botao
          variante="primario"
          tamanho="compacto"
          disabled={!prontos || criando}
          onClick={() => setCriando(true)}
        >
          <span aria-hidden>＋</span>
          {ROTULOS.novo}
        </Botao>
      </header>

      {prontos ? (
        <div className="w-72 px-2">
          <Seletor
            rotulo={ROTULOS.status_padrao}
            value={padraoVigente(linhas, padraoId) ?? ""}
            onChange={async (e) =>
              avisarSeFalhou(await repoConfiguracoes().definirStatusPadrao(e.target.value || null))
            }
            opcoes={[
              { valor: "", rotulo: ROTULOS.nenhum_nao_pago },
              ...ativos(linhas).map((s) => ({ valor: s.id, rotulo: s.nome })),
            ]}
          />
        </div>
      ) : null}

      {conteudo}

      {criando && prontos ? (
        <form
          className="flex flex-wrap items-start gap-2 px-2"
          onSubmit={(e) => {
            e.preventDefault();
            void adicionar();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancelarNovo();
          }}
        >
          <div className="w-56">
            <Campo
              rotulo={ROTULOS.nome_novo_status}
              autoFocus
              value={nomeNovo}
              maxLength={60}
              disabled={salvandoNovo}
              erro={erroNovo}
              onChange={(e) => {
                setNomeNovo(e.target.value);
                setErroNovo(null);
              }}
            />
          </div>
          <div className="flex gap-2 pt-5">
            <Botao type="submit" variante="primario" disabled={salvandoNovo}>
              {ROTULOS.adicionar}
            </Botao>
            <Botao variante="secundario" onClick={cancelarNovo}>
              {ROTULOS.cancelar}
            </Botao>
          </div>
        </form>
      ) : null}

      {exclusao.elemento}
    </section>
  );
}
