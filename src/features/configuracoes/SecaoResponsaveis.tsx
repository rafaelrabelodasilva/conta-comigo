"use client";

import { useState } from "react";
import { opcoesDeSubstituto } from "@/domain/cadastros";
import { ROTULOS, mensagem } from "@/domain/mensagens";
import {
  ativos,
  moverResponsavel,
  ordenarParaConfiguracoes,
  proximaCor,
  proximaOrdem,
  validarDesarquivar,
  validarNome,
  type Direcao,
} from "@/domain/responsaveis";
import { gerenciador, useLinhas } from "@/data/realtime";
import { repoResponsaveis, type ResultadoGravacao } from "@/data/responsaveis-repo";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { useToast } from "@/ui/Toast";
import { useExcluirCadastro } from "./ExcluirCadastro";
import { LinhaResponsavel } from "./LinhaResponsavel";

// Configurações → Responsáveis. Lê só pelo hook do gerenciador de Realtime
// e grava só pelo repositório; as regras vêm do núcleo. Mudanças feitas em
// outro aparelho aparecem sozinhas.

export function SecaoResponsaveis() {
  const { status, linhas } = useLinhas("responsaveis");
  const toast = useToast();
  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [salvandoNovo, setSalvandoNovo] = useState(false);

  const repo = repoResponsaveis();
  const lista = ordenarParaConfiguracoes(linhas);
  const cor = proximaCor(linhas);
  const semCor = !cor.ok;

  function avisarSeFalhou(r: ResultadoGravacao) {
    if (!r.ok) toast.mostrar({ texto: mensagem("salvar.falhou") });
  }

  async function arquivar(id: string) {
    avisarSeFalhou(await repo.arquivar(id));
  }

  const exclusao = useExcluirCadastro({
    cadastro: "responsavel",
    opcoes: (deId) => opcoesDeSubstituto(ativos(linhas), deId),
    aoArquivar: (id) => void arquivar(id),
  });

  async function adicionar() {
    const nome = validarNome(nomeNovo, linhas);
    if (!nome.ok) {
      setErroNovo(mensagem(nome.erro.codigo));
      return;
    }
    if (!cor.ok) {
      setErroNovo(mensagem(cor.erro.codigo));
      return;
    }
    setSalvandoNovo(true);
    const r = await repo.criar({ nome: nome.valor, cor: cor.valor, ordem: proximaOrdem(linhas) });
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

  async function mover(id: string, direcao: Direcao) {
    const r = moverResponsavel(linhas, id, direcao);
    if (!r.ok) return;
    avisarSeFalhou(await repo.reordenar(r.valor));
  }

  async function desarquivar(id: string) {
    // Volta à lista de escolha: o nome não pode repetir o de um ativo.
    const r = validarDesarquivar(linhas, id);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.erro.codigo) });
      return;
    }
    avisarSeFalhou(await repo.desarquivar(id, r.valor));
  }

  let conteudo;
  if (status === "erro") {
    conteudo = <ErroAoCarregar aoTentarDeNovo={() => void gerenciador("responsaveis").recarregar()} />;
  } else if (status === "carregando") {
    conteudo = (
      <div className="flex flex-col gap-2 p-2" aria-busy>
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-toque" />
        ))}
      </div>
    );
  } else if (lista.length === 0 && !criando) {
    conteudo = <EstadoVazio texto={mensagem("responsavel.lista_vazia")} />;
  } else {
    conteudo = (
      <ul className="flex flex-col">
        {lista.map((r) => (
          <LinhaResponsavel
            key={r.id}
            responsavel={r}
            todos={linhas}
            aoRenomear={async (id, nome) => avisarSeFalhou(await repo.atualizar(id, { nome }))}
            aoTrocarCor={async (id, nova) => avisarSeFalhou(await repo.atualizar(id, { cor: nova }))}
            aoMover={mover}
            aoArquivar={arquivar}
            aoDesarquivar={desarquivar}
            aoExcluir={(id) => void exclusao.pedir({ id, nome: r.nome })}
          />
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="titulo-responsaveis" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      <header className="flex flex-wrap items-center gap-3">
        <h2 id="titulo-responsaveis" className="flex-1 texto-body-strong">
          {ROTULOS.responsaveis}
        </h2>
        {status === "pronto" && semCor ? (
          <p className="texto-label font-normal text-text-muted">
            {mensagem("responsavel.sem_cor_livre")}
          </p>
        ) : null}
        <Botao
          variante="primario"
          tamanho="compacto"
          disabled={status !== "pronto" || semCor || criando}
          onClick={() => setCriando(true)}
        >
          <span aria-hidden>＋</span>
          {ROTULOS.novo}
        </Botao>
      </header>

      {conteudo}

      {criando && status === "pronto" ? (
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
              rotulo={ROTULOS.nome_novo_responsavel}
              autoFocus
              value={nomeNovo}
              maxLength={60}
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
