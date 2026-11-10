"use client";

import { useEffect, useMemo, useState } from "react";
import { ROTULOS, TEXTOS_REVISAR as T } from "@/domain/mensagens";
import { ordenarPorUso, type ItemDaFila } from "@/domain/revisar";
import { repoCadastros } from "@/data/cadastros-repo";
import { Botao } from "@/ui/Botao";
import { Janela } from "@/ui/Janela";
import { Seletor } from "@/ui/Seletor";

// Janela "Mudar" da fila do Revisar: Seletor de Responsável e de Tipo (só
// os ativos; os mais usados primeiro, pela contagem do banco, e, se ela
// falhar, na ordem do cadastro), pré-preenchida com o que a linha tem ou a
// sugestão. "Salvar" só com os dois escolhidos; a gravação é de quem abre a
// janela (`aoSalvar`), que a fecha quando dá certo.

export type CadastroDaJanela = { id: string; nome: string; arquivado: boolean };

export type PropsJanelaMudar = {
  item: ItemDaFila;
  /** Já na ordem do cadastro (Responsáveis pela ordem; Tipos em ordem alfabética). */
  responsaveis: readonly CadastroDaJanela[];
  tipos: readonly CadastroDaJanela[];
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  /** Grava a escolha; devolve se deu certo (a janela fecha). */
  aoSalvar: (item: ItemDaFila, escolha: { responsavel_id: string; tipo_id: string }) => Promise<boolean>;
};

type Usos = { responsaveis: ReadonlyMap<string, number> | null; tipos: ReadonlyMap<string, number> | null };

/** O id só vale se ainda é um cadastro ativo; senão, a escolha começa vazia. */
function inicial(id: string | null, ativos: readonly CadastroDaJanela[]): string {
  return id !== null && ativos.some((c) => c.id === id) ? id : "";
}

export function JanelaMudar({ item, responsaveis, tipos, aberta, aoMudar, aoSalvar }: PropsJanelaMudar) {
  const [responsavelId, setResponsavelId] = useState(() => inicial(item.preenchido.responsavel_id, responsaveis.filter((r) => !r.arquivado)));
  const [tipoId, setTipoId] = useState(() => inicial(item.preenchido.tipo_id, tipos.filter((t) => !t.arquivado)));
  const [usos, setUsos] = useState<Usos | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Os mais usados primeiro: lê a contagem ao abrir; falhou → ordem do cadastro.
  useEffect(() => {
    if (!aberta) return;
    let vale = true;
    const ler = async (cadastro: "responsavel" | "tipo") => {
      try {
        const r = await repoCadastros().contarUsos(cadastro);
        return r.ok ? r.valor : null;
      } catch {
        return null;
      }
    };
    void Promise.all([ler("responsavel"), ler("tipo")]).then(([r, t]) => {
      if (vale) setUsos({ responsaveis: r, tipos: t });
    });
    return () => {
      vale = false;
    };
  }, [aberta]);

  const opcoesResponsavel = useMemo(
    () => ordenarPorUso(responsaveis, usos?.responsaveis ?? null).map((r) => ({ valor: r.id, rotulo: r.nome })),
    [responsaveis, usos],
  );
  const opcoesTipo = useMemo(
    () => ordenarPorUso(tipos, usos?.tipos ?? null).map((t) => ({ valor: t.id, rotulo: t.nome })),
    [tipos, usos],
  );

  const completo = responsavelId !== "" && tipoId !== "";

  async function salvar() {
    if (!completo || salvando) return;
    setSalvando(true);
    const ok = await aoSalvar(item, { responsavel_id: responsavelId, tipo_id: tipoId });
    setSalvando(false);
    if (ok) aoMudar(false);
  }

  return (
    <Janela
      aberta={aberta}
      aoMudar={aoMudar}
      titulo={T.titulo_mudar}
      descricao={item.nome}
      rodape={
        <>
          <Botao onClick={() => aoMudar(false)}>{ROTULOS.cancelar}</Botao>
          <Botao variante="primario" disabled={!completo || salvando} onClick={() => void salvar()}>
            {ROTULOS.salvar}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Seletor
          rotulo={T.responsavel}
          value={responsavelId}
          onChange={(e) => setResponsavelId(e.target.value)}
          opcoes={[{ valor: "", rotulo: T.escolha }, ...opcoesResponsavel]}
        />
        <Seletor
          rotulo={T.tipo}
          value={tipoId}
          onChange={(e) => setTipoId(e.target.value)}
          opcoes={[{ valor: "", rotulo: T.escolha }, ...opcoesTipo]}
        />
      </div>
    </Janela>
  );
}
