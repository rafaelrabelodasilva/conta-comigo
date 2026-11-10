"use client";

import { useEffect, useMemo, useState } from "react";
import { ROTULOS, TEXTOS_REVISAR as T, rotuloAplicarA, rotuloSelecionados } from "@/domain/mensagens";
import { ordenarPorUso } from "@/domain/revisar";
import { repoCadastros } from "@/data/cadastros-repo";
import { Botao } from "@/ui/Botao";
import { Janela } from "@/ui/Janela";
import { Seletor } from "@/ui/Seletor";
import type { CadastroDaJanela } from "./JanelaMudar";

// Janela do lote (História 3.3): "Responsável…" ou "Tipo…" da barra. Um
// Seletor com os cadastros ativos (os mais usados primeiro, pela contagem do
// banco; se ela falhar, na ordem do cadastro) e "Aplicar a N". A gravação é de
// quem abre a janela (`aoAplicar`), que a fecha quando dá certo.

export type PropsJanelaLote = {
  /** Qual campo o lote escolhe. */
  campo: "responsavel" | "tipo";
  quantidade: number;
  /** Já na ordem do cadastro. */
  cadastros: readonly CadastroDaJanela[];
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  /** Grava o cadastro escolhido em todos os marcados; devolve se deu certo (a janela fecha). */
  aoAplicar: (id: string) => Promise<boolean>;
};

export function JanelaLote({ campo, quantidade, cadastros, aberta, aoMudar, aoAplicar }: PropsJanelaLote) {
  const [escolhido, setEscolhido] = useState("");
  const [usos, setUsos] = useState<ReadonlyMap<string, number> | null>(null);
  const [aplicando, setAplicando] = useState(false);

  // Os mais usados primeiro: lê a contagem ao abrir; falhou → ordem do cadastro.
  useEffect(() => {
    if (!aberta) return;
    let vale = true;
    void (async () => {
      let lido: ReadonlyMap<string, number> | null = null;
      try {
        const r = await repoCadastros().contarUsos(campo);
        lido = r.ok ? r.valor : null;
      } catch {
        lido = null;
      }
      if (vale) setUsos(lido);
    })();
    return () => {
      vale = false;
    };
  }, [aberta, campo]);

  const opcoes = useMemo(
    () => ordenarPorUso(cadastros, usos).map((c) => ({ valor: c.id, rotulo: c.nome })),
    [cadastros, usos],
  );
  const rotulo = campo === "responsavel" ? T.responsavel : T.tipo;

  async function aplicar() {
    if (escolhido === "" || aplicando) return;
    setAplicando(true);
    const ok = await aoAplicar(escolhido);
    setAplicando(false);
    if (ok) aoMudar(false);
  }

  return (
    <Janela
      aberta={aberta}
      aoMudar={aoMudar}
      titulo={campo === "responsavel" ? T.titulo_lote_responsavel : T.titulo_lote_tipo}
      descricao={rotuloSelecionados(quantidade)}
      rodape={
        <>
          <Botao onClick={() => aoMudar(false)}>{ROTULOS.cancelar}</Botao>
          <Botao variante="primario" disabled={escolhido === "" || aplicando} onClick={() => void aplicar()}>
            {rotuloAplicarA(quantidade)}
          </Botao>
        </>
      }
    >
      <Seletor
        rotulo={rotulo}
        value={escolhido}
        onChange={(e) => setEscolhido(e.target.value)}
        opcoes={[{ valor: "", rotulo: T.escolha }, ...opcoes]}
      />
    </Janela>
  );
}
