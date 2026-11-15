"use client";

import { useMemo, useState } from "react";
import { arquivadosNaFormula, lerBlocos, planejarReordenar, resumirBloco, type BlocoParaGravar } from "@/domain/blocos";
import { formatarDinheiro } from "@/domain/dinheiro";
import { textoDaFormula } from "@/domain/formula";
import { TEXTOS_BLOCO as T, descricaoExcluirBloco, mensagem } from "@/domain/mensagens";
import { idsDosPrevistos, projetarPainel, type LancamentoParaProjetar } from "@/domain/projecoes";
import { repoBlocos } from "@/data/blocos-repo";
import { gerenciador, useLinhas } from "@/data/realtime";
import { ConfirmarAcao } from "@/ui/ConfirmarAcao";
import { useToast } from "@/ui/Toast";
import { CartaoBlocos } from "./CartaoBlocos";
import { MontadorBloco } from "./MontadorBloco";

// Os Blocos do Mês aberto (Histórias 4.1 e 4.2, FR-19, FR-54): lê `blocos`,
// `responsaveis` e `tipos` pelo gerenciador de Realtime e calcula cada Bloco
// com o núcleo (`resumirBloco` = `avaliar` sobre `projetarPainel`), então o
// valor do cartão, o passo a passo de "Ver cálculo" e (depois) a mensagem são
// o mesmo número. Qualquer mudança nos Lançamentos (em qualquer aparelho)
// entra por `linhas` e o valor muda no lugar, sem esqueleto. Aqui moram só o
// estado das janelas (Montador, confirmação de excluir) e do modo Reordenar;
// as regras são do núcleo e a gravação é do repositório de Blocos.
//
// Filtrar a grade (História 4.3, FR-20): o Painel passa o Bloco que filtra
// (`ativoId`) e o que fazer ao tocar num cartão (`aoFiltrar`); o passo
// "Blocos" do Primeiro uso não passa nenhum dos dois e o cartão não filtra.
// `aoExcluindo` avisa o Painel antes de gravar a exclusão, para ele desfazer o
// filtro daquele Bloco já (como o Painel fecha a linha aberta antes de excluir).
//
// Gerar mensagem (História 4.7, FR-53): `aoGerarMensagem` (o 💬 e o item do ⋯) avisa
// o Painel, que abre a janela da forma 2. O passo "Blocos" do Primeiro uso não passa e
// o cartão não oferece a mensagem.

type Montador = { modo: "novo" } | { modo: "editar" | "ver"; id: string };

export function BlocosDoMes({
  linhas,
  mes,
  ativoId,
  aoFiltrar,
  aoExcluindo,
  aoGerarMensagem,
}: {
  /** Os Lançamentos do Mês aberto (a memória do Painel). */
  linhas: readonly LancamentoParaProjetar[];
  mes: string;
  /** O Bloco que filtra a grade (borda em destaque). */
  ativoId?: string | null;
  /** Tocar no cartão: liga, desliga ou troca o filtro por Bloco. */
  aoFiltrar?: (id: string) => void;
  /** O Bloco vai ser excluído (antes de gravar). */
  aoExcluindo?: (id: string) => void;
  /** O 💬 ou "Gerar mensagem" do ⋯ de um Bloco. Sem isto, o cartão não oferece a mensagem. */
  aoGerarMensagem?: (id: string) => void;
}) {
  const toast = useToast();
  const blocosLidos = useLinhas("blocos");
  const responsaveis = useLinhas("responsaveis");
  const tipos = useLinhas("tipos");
  const [montador, setMontador] = useState<Montador | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [reordenando, setReordenando] = useState(false);

  const blocos = useMemo(() => lerBlocos(blocosLidos.linhas), [blocosLidos.linhas]);
  // Os nomes com os arquivados: uma Fórmula antiga ainda os cita.
  const nomes = useMemo(
    () => ({
      responsaveis: new Map(responsaveis.linhas.map((r) => [r.id, r.nome])),
      tipos: new Map(tipos.linhas.map((t) => [t.id, t.nome])),
    }),
    [responsaveis.linhas, tipos.linhas],
  );
  const corDoResponsavel = useMemo(() => new Map(responsaveis.linhas.map((r) => [r.id, r.cor])), [responsaveis.linhas]);

  // A mesma projeção do Painel para o cartão e para "Ver cálculo".
  const projecao = useMemo(() => projetarPainel(linhas, mes), [linhas, mes]);
  const previstos = useMemo(() => idsDosPrevistos(linhas, mes), [linhas, mes]);
  const itens = useMemo(
    () =>
      blocos.map((b) => {
        const resumo = resumirBloco(b, projecao, previstos);
        return {
          id: b.id,
          nome: b.nome,
          formula: textoDaFormula(b.formula, nomes),
          valor: resumo.valorCentavos === null ? T.sem_valor : formatarDinheiro(resumo.valorCentavos),
          semValor: resumo.valorCentavos === null,
          incluiPrevistos: resumo.incluiPrevistos,
          corPessoa: resumo.responsavelId === null ? null : (corDoResponsavel.get(resumo.responsavelId) ?? null),
          arquivados: arquivadosNaFormula(b.formula, { responsaveis: responsaveis.linhas, tipos: tipos.linhas }),
        };
      }),
    [blocos, projecao, previstos, nomes, corDoResponsavel, responsaveis.linhas, tipos.linhas],
  );

  // Um Bloco apagado em outro aparelho fecha a janela que o abria.
  const doMontador = montador && montador.modo !== "novo" ? blocos.find((b) => b.id === montador.id) : undefined;
  const montadorAberto = montador !== null && (montador.modo === "novo" || doMontador !== undefined) ? montador : null;
  const aExcluir = excluindo === null ? undefined : blocos.find((b) => b.id === excluindo);
  // Sobrando um Bloco só (ou nenhum), não há o que reordenar.
  const reordenandoDe = reordenando && blocos.length > 1;

  async function salvar(pedido: BlocoParaGravar): Promise<boolean> {
    const r = await repoBlocos().salvar(pedido);
    toast.mostrar({ texto: r.ok ? T.salvo : mensagem(r.codigo) });
    return r.ok;
  }

  async function mudarOrdem(ids: string[]) {
    const plano = planejarReordenar(blocos, ids);
    if (!plano.ok) {
      toast.mostrar({ texto: mensagem(plano.erro.codigo) });
      return;
    }
    if (!plano.valor.mudou) return;
    const r = await repoBlocos().reordenar(plano.valor.ids);
    if (!r.ok) toast.mostrar({ texto: mensagem(r.codigo) });
  }

  async function excluir(id: string) {
    aoExcluindo?.(id);
    const r = await repoBlocos().excluir(id);
    toast.mostrar({ texto: r.ok ? T.excluido : mensagem(r.codigo) });
  }

  return (
    <>
      <CartaoBlocos
        itens={itens}
        carregando={blocosLidos.status === "carregando"}
        erro={blocosLidos.status === "erro"}
        reordenando={reordenandoDe}
        ativoId={ativoId}
        aoFiltrar={aoFiltrar}
        aoNovo={() => setMontador({ modo: "novo" })}
        aoTentarDeNovo={() => void gerenciador("blocos").recarregar()}
        aoAlternarReordenar={() => setReordenando(!reordenandoDe)}
        aoEditar={(id) => setMontador({ modo: "editar", id })}
        aoVerCalculo={(id) => setMontador({ modo: "ver", id })}
        aoGerarMensagem={aoGerarMensagem}
        aoExcluir={setExcluindo}
        aoMudarOrdem={(ids) => void mudarOrdem(ids)}
      />
      {montadorAberto ? (
        <MontadorBloco
          key={montadorAberto.modo === "novo" ? "novo" : `${montadorAberto.modo}:${montadorAberto.id}`}
          aberta
          aoMudar={(aberta) => {
            if (!aberta) setMontador(null);
          }}
          linhas={linhas}
          mes={mes}
          responsaveis={responsaveis.linhas}
          tipos={tipos.linhas}
          blocos={blocos}
          inicial={doMontador}
          somenteLeitura={montadorAberto.modo === "ver"}
          aoSalvar={salvar}
        />
      ) : null}
      <ConfirmarAcao
        aberta={aExcluir !== undefined}
        aoMudar={(abrir) => {
          if (!abrir) setExcluindo(null);
        }}
        titulo={T.excluir_titulo}
        descricao={aExcluir ? descricaoExcluirBloco(aExcluir.nome, aExcluir.de_cobranca) : ""}
        rotuloConfirmar={T.excluir_confirmar}
        aoConfirmar={() => {
          if (excluindo !== null) void excluir(excluindo);
          setExcluindo(null);
        }}
      />
    </>
  );
}
