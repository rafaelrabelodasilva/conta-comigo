"use client";

import { useState } from "react";
import { validarExclusao, type Cadastro } from "@/domain/cadastros";
import { ROTULOS, mensagem, tituloEmUso, tituloExcluir } from "@/domain/mensagens";
import { repoCadastros } from "@/data/cadastros-repo";
import { Botao } from "@/ui/Botao";
import { ConfirmarAcao } from "@/ui/ConfirmarAcao";
import { Janela } from "@/ui/Janela";
import { Seletor } from "@/ui/Seletor";
import { useToast } from "@/ui/Toast";

// ⋯ → Excluir em Responsáveis, Tipos e Status (História 1.6). Conta o uso
// na hora: sem uso, pede confirmação e exclui; em uso, abre a janela
// "N registros usam “X”" com o seletor de substituto (ativos do mesmo
// cadastro, sem ele mesmo), "Substituir e excluir", "Arquivar" e "Cancelar".
// A exclusão é sempre pela RPC (repositório de cadastros).

type Item = { id: string; nome: string };

type Pedido = Item & { usos: number };

export type OpcoesExcluirCadastro = {
  cadastro: Cadastro;
  /** Substitutos possíveis para `deId` (o núcleo: `opcoesDeSubstituto`). */
  opcoes: (deId: string) => readonly Item[];
  /** "Arquivar" na janela de em uso; a seção aplica as próprias regras. */
  aoArquivar: (id: string) => void;
  /** Depois de excluir (ex.: recontar o uso). */
  aoExcluir?: () => void;
};

/** Devolve `pedir(item)`, que inicia a exclusão, e o elemento das janelas. */
export function useExcluirCadastro({ cadastro, opcoes, aoArquivar, aoExcluir }: OpcoesExcluirCadastro) {
  const toast = useToast();
  const [pedido, setPedido] = useState<Pedido | null>(null);

  async function pedir(item: Item) {
    const contagem = await repoCadastros().contarUsos(cadastro);
    if (!contagem.ok) {
      toast.mostrar({ texto: mensagem(contagem.codigo) });
      return;
    }
    setPedido({ ...item, usos: contagem.valor.get(item.id) ?? 0 });
  }

  async function excluir(alvo: Pedido, paraId: string | null): Promise<boolean> {
    const valido = validarExclusao(alvo.usos, paraId, opcoes(alvo.id));
    if (!valido.ok) {
      toast.mostrar({ texto: mensagem(valido.erro.codigo) });
      return false;
    }
    const r = await repoCadastros().excluir(cadastro, alvo.id, valido.valor.paraId);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return false;
    }
    aoExcluir?.();
    return true;
  }

  const fechar = () => setPedido(null);

  const elemento =
    pedido === null ? null : pedido.usos === 0 ? (
      <ConfirmarAcao
        aberta
        aoMudar={(aberta) => {
          if (!aberta) fechar();
        }}
        titulo={tituloExcluir(pedido.nome)}
        descricao={mensagem("cadastro.excluir_irreversivel")}
        rotuloConfirmar={ROTULOS.excluir}
        aoConfirmar={() => void excluir(pedido, null)}
      />
    ) : (
      <JanelaEmUso
        key={pedido.id}
        pedido={pedido}
        opcoes={opcoes(pedido.id)}
        aoFechar={fechar}
        aoArquivar={() => {
          fechar();
          aoArquivar(pedido.id);
        }}
        aoSubstituir={async (paraId) => {
          if (await excluir(pedido, paraId)) fechar();
        }}
      />
    );

  return { pedir, elemento };
}

function JanelaEmUso({
  pedido,
  opcoes,
  aoFechar,
  aoArquivar,
  aoSubstituir,
}: {
  pedido: Pedido;
  opcoes: readonly Item[];
  aoFechar: () => void;
  aoArquivar: () => void;
  aoSubstituir: (paraId: string) => Promise<void>;
}) {
  const [paraId, setParaId] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Um substituto que sumiu (arquivado ou excluído em outro aparelho) deixa de valer.
  const escolhido = opcoes.some((o) => o.id === paraId) ? paraId : "";

  return (
    <Janela
      aberta
      aoMudar={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo={tituloEmUso(pedido.usos, pedido.nome)}
      descricao={mensagem("cadastro.em_uso")}
      className="max-w-112"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            {ROTULOS.cancelar}
          </Botao>
          <Botao variante="secundario" onClick={aoArquivar}>
            {ROTULOS.arquivar}
          </Botao>
          <Botao
            variante="destrutivo"
            disabled={!escolhido || salvando}
            onClick={async () => {
              setSalvando(true);
              await aoSubstituir(escolhido);
              setSalvando(false);
            }}
          >
            {ROTULOS.substituir_e_excluir}
          </Botao>
        </>
      }
    >
      <Seletor
        rotulo={ROTULOS.substituto}
        value={escolhido}
        disabled={salvando}
        onChange={(e) => setParaId(e.target.value)}
        opcoes={[
          { valor: "", rotulo: ROTULOS.escolha },
          ...opcoes.map((o) => ({ valor: o.id, rotulo: o.nome })),
        ]}
      />
    </Janela>
  );
}
