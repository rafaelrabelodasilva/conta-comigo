"use client";

import { useState } from "react";
import { opcoesDeSubstituto } from "@/domain/cadastros";
import { ROTULOS, mensagem } from "@/domain/mensagens";
import { ativos, ordenarParaConfiguracoes, validarDesarquivarTipo, validarNomeTipo } from "@/domain/tipos";
import { gerenciador, useLinhas } from "@/data/realtime";
import { repoTipos, type ResultadoGravacao } from "@/data/tipos-repo";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { useToast } from "@/ui/Toast";
import { useExcluirCadastro } from "./ExcluirCadastro";
import { useAvisarRascunho, useRascunhosDasLinhas, type PropsSecao } from "./rascunho";
import { LinhaTipo } from "./LinhaTipo";

// Configurações → Tipos. Lê só pelo hook do gerenciador de Realtime e grava
// só pelo repositório; as regras vêm do núcleo. Mudanças feitas em outro
// aparelho aparecem sozinhas. Lista alfabética, arquivados no fim.

export function SecaoTipos({ aoMudarRascunho }: PropsSecao = {}) {
  const { status, linhas } = useLinhas("tipos");
  const toast = useToast();
  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  // Só no Primeiro uso: avisa se há nome novo digitado ou nome em edição.
  const rascunhosLinhas = useRascunhosDasLinhas();
  useAvisarRascunho((criando && nomeNovo.trim() !== "") || rascunhosLinhas.algum, aoMudarRascunho);

  const repo = repoTipos();
  const lista = ordenarParaConfiguracoes(linhas);

  function avisarSeFalhou(r: ResultadoGravacao) {
    if (!r.ok) toast.mostrar({ texto: mensagem("salvar.falhou") });
  }

  async function arquivar(id: string) {
    avisarSeFalhou(await repo.arquivar(id));
  }

  const exclusao = useExcluirCadastro({
    cadastro: "tipo",
    opcoes: (deId) => opcoesDeSubstituto(ativos(linhas), deId),
    aoArquivar: (id) => void arquivar(id),
  });

  async function adicionar() {
    const nome = validarNomeTipo(nomeNovo, linhas);
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

  async function desarquivar(id: string) {
    // Volta à lista de escolha: o nome não pode repetir o de um ativo.
    const r = validarDesarquivarTipo(linhas, id);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.erro.codigo) });
      return;
    }
    avisarSeFalhou(await repo.desarquivar(id));
  }

  let conteudo;
  if (status === "erro") {
    conteudo = <ErroAoCarregar aoTentarDeNovo={() => void gerenciador("tipos").recarregar()} />;
  } else if (status === "carregando") {
    conteudo = (
      <div className="flex flex-col gap-2 p-2" aria-busy>
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-toque" />
        ))}
      </div>
    );
  } else if (lista.length === 0 && !criando) {
    conteudo = <EstadoVazio texto={mensagem("tipo.lista_vazia")} />;
  } else {
    conteudo = (
      <ul className="flex flex-col">
        {lista.map((t) => (
          <LinhaTipo
            key={t.id}
            tipo={t}
            todos={linhas}
            aoRenomear={async (id, nome) => avisarSeFalhou(await repo.atualizar(id, { nome }))}
            aoArquivar={arquivar}
            aoDesarquivar={desarquivar}
            aoMudarRascunho={aoMudarRascunho ? rascunhosLinhas.mudar : undefined}
            aoExcluir={(id) => void exclusao.pedir({ id, nome: t.nome })}
          />
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="titulo-tipos" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      <header className="flex flex-wrap items-center gap-3">
        <h2 id="titulo-tipos" className="flex-1 texto-body-strong">
          {ROTULOS.tipos}
        </h2>
        <Botao
          variante="primario"
          tamanho="compacto"
          disabled={status !== "pronto" || criando}
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
              rotulo={ROTULOS.nome_novo_tipo}
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
