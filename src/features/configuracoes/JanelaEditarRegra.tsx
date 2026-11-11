"use client";

import { useState } from "react";
import { ROTULOS, TEXTOS_REGRAS as T, mensagem, rotuloAsVezes } from "@/domain/mensagens";
import type { EdicaoRegra } from "@/domain/regras";
import { Botao } from "@/ui/Botao";
import { Janela } from "@/ui/Janela";
import { Seletor } from "@/ui/Seletor";

// Janela "Editar Regra" (História 3.4): Seletor de Responsável e de Tipo (só
// os ativos, mais "Nenhum"), pré-preenchida com o que a Regra tem. Só o
// Responsável e o Tipo se editam (a chave, a contagem e a Divisão não).
// "Salvar" só com ao menos um dos dois; a gravação é de quem abre a janela
// (`aoSalvar`), que a fecha quando dá certo.

export type CadastroDaRegra = { id: string; nome: string; arquivado: boolean };

export type PropsJanelaEditarRegra = {
  regra: { chave: string; responsavel_id: string | null; tipo_id: string | null };
  /** Os outros Responsáveis da contagem, já em nomes ("Rafael"). */
  outrosResponsaveis: readonly string[];
  responsaveis: readonly CadastroDaRegra[];
  tipos: readonly CadastroDaRegra[];
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  /** Grava a edição; devolve se deu certo (a janela fecha). */
  aoSalvar: (edicao: EdicaoRegra) => Promise<boolean>;
};

/** O id só vale se ainda é um cadastro ativo; senão, a escolha começa em "Nenhum". */
function inicial(id: string | null, ativos: readonly CadastroDaRegra[]): string {
  return id !== null && ativos.some((c) => c.id === id) ? id : "";
}

export function JanelaEditarRegra({
  regra,
  outrosResponsaveis,
  responsaveis,
  tipos,
  aberta,
  aoMudar,
  aoSalvar,
}: PropsJanelaEditarRegra) {
  const ativosR = responsaveis.filter((r) => !r.arquivado);
  const ativosT = tipos.filter((t) => !t.arquivado);
  const [responsavelId, setResponsavelId] = useState(() => inicial(regra.responsavel_id, ativosR));
  const [tipoId, setTipoId] = useState(() => inicial(regra.tipo_id, ativosT));
  const [salvando, setSalvando] = useState(false);

  const vazio = responsavelId === "" && tipoId === "";

  async function salvar() {
    if (vazio || salvando) return;
    setSalvando(true);
    // Só o que mudou em relação ao que a janela mostrou ao abrir (um arquivado intocado fica como está).
    const edicao: EdicaoRegra = {};
    if (responsavelId !== inicial(regra.responsavel_id, ativosR)) {
      edicao.responsavel_id = responsavelId === "" ? null : responsavelId;
    }
    if (tipoId !== inicial(regra.tipo_id, ativosT)) {
      edicao.tipo_id = tipoId === "" ? null : tipoId;
    }
    const ok = await aoSalvar(edicao);
    setSalvando(false);
    if (ok) aoMudar(false);
  }

  return (
    <Janela
      aberta={aberta}
      aoMudar={aoMudar}
      titulo={T.titulo_editar}
      descricao={regra.chave}
      rodape={
        <>
          <Botao onClick={() => aoMudar(false)}>{ROTULOS.cancelar}</Botao>
          <Botao variante="primario" disabled={vazio || salvando} onClick={() => void salvar()}>
            {T.salvar}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Seletor
          rotulo={T.responsavel}
          value={responsavelId}
          onChange={(e) => setResponsavelId(e.target.value)}
          opcoes={[{ valor: "", rotulo: T.nenhum }, ...ativosR.map((r) => ({ valor: r.id, rotulo: r.nome }))]}
        />
        {outrosResponsaveis.length > 0 ? (
          <p className="texto-caption text-text-muted">{rotuloAsVezes(outrosResponsaveis)}</p>
        ) : null}
        <Seletor
          rotulo={T.tipo}
          value={tipoId}
          onChange={(e) => setTipoId(e.target.value)}
          opcoes={[{ valor: "", rotulo: T.nenhum }, ...ativosT.map((t) => ({ valor: t.id, rotulo: t.nome }))]}
        />
        {vazio ? (
          <p role="alert" className="texto-caption text-danger-fg">
            {mensagem("regra.vazia")}
          </p>
        ) : null}
      </div>
    </Janela>
  );
}
