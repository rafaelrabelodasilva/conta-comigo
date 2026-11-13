"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { hojeEmSaoPaulo } from "@/domain/datas";
import { lerDivisao } from "@/domain/divisao";
import {
  DESCRICAO_EXCLUIR_REGRA,
  ROTULOS,
  TEXTOS_REGRAS as T,
  mensagem,
  perguntaReaplicar,
  rotuloClassificados,
  rotuloCriadasAgora,
  textoDaDivisao,
  tituloExcluirRegra,
} from "@/domain/mensagens";
import { mesAtual } from "@/domain/painel";
import {
  entradasDaReaplicacao,
  filtrarRegras,
  ordenarRegras,
  outrosResponsaveisDaRegra,
  regrasCriadasDesde,
  type EdicaoRegra,
} from "@/domain/regras";
import { repoLancamentos } from "@/data/lancamentos-repo";
import { gerenciador, useLinhas } from "@/data/realtime";
import { repoRegras } from "@/data/regras-repo";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { ConfirmarAcao } from "@/ui/ConfirmarAcao";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { FaixaPergunta } from "@/ui/FaixaPergunta";
import { useToast } from "@/ui/Toast";
import { JanelaEditarRegra } from "./JanelaEditarRegra";
import { COLUNAS_REGRA, LinhaRegra } from "./LinhaRegra";

// Configurações → Regras aprendidas (História 3.4, FR-12, UX-DR25). Lê só
// pelo gerenciador de Realtime e grava só por `regrasRepo` (editar, excluir)
// e `repoLancamentos` (reaplicar, em lote). Lista com busca; "Editar" abre a
// janela de Responsável e Tipo e, se alguma linha do Mês atual muda, a faixa
// "Reaplicar aos lançamentos de Mmm/AA?" ("Só este" / "Aplicar a todos").
// "Excluir" pede confirmação. As regras de negócio são do núcleo.

type Reaplicar = {
  chave: string;
  campos: { responsavel_id?: string; tipo_id?: string };
  mes: string;
};

export function SecaoRegras({ criadasDesde }: { criadasDesde?: string } = {}) {
  const regras = useLinhas("regras");
  const responsaveis = useLinhas("responsaveis");
  const tipos = useLinhas("tipos");
  const lancamentos = useLinhas("lancamentos");
  const toast = useToast();
  const [busca, setBusca] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [pergunta, setPergunta] = useState<Reaplicar | null>(null);
  const [aplicando, setAplicando] = useState(false);
  // O Mês da reaplicação: o Mês atual (o mesmo em que o Painel começa).
  const [mes] = useState(() => mesAtual(hojeEmSaoPaulo(new Date())));
  // Numa ref: dois toques seguidos em "Aplicar a todos" gravam uma vez só.
  const emCurso = useRef(false);

  useEffect(() => {
    gerenciador("lancamentos").abrirMes(mes);
  }, [mes]);

  const nomes = useMemo(
    () => ({
      responsaveis: new Map(responsaveis.linhas.map((r) => [r.id, r.nome])),
      tipos: new Map(tipos.linhas.map((t) => [t.id, t.nome])),
    }),
    [responsaveis.linhas, tipos.linhas],
  );
  /** A Divisão da Regra em texto ("Mãe 2/3 · Rafael 1/3"); sem Divisão válida, null. */
  const divisaoEmTexto = (dados: unknown): string | null => {
    const d = lerDivisao(dados);
    return d === null ? null : textoDaDivisao(d, (id) => nomes.responsaveis.get(id) ?? T.sem_valor);
  };
  // "Criadas agora" (3.10): só as Regras que a última importação da planilha criou.
  const doFiltro = useMemo(() => regrasCriadasDesde(regras.linhas, criadasDesde), [regras.linhas, criadasDesde]);
  const lista = useMemo(
    () => filtrarRegras(ordenarRegras(doFiltro), busca, nomes),
    [doFiltro, busca, nomes],
  );
  const editando = editandoId === null ? null : (regras.linhas.find((r) => r.id === editandoId) ?? null);
  const excluindo = excluindoId === null ? null : (regras.linhas.find((r) => r.id === excluindoId) ?? null);

  // A pergunta só existe enquanto alguma linha ainda mudaria (outro aparelho pode ter mudado antes).
  const mudariam = pergunta ? entradasDe(pergunta).length : 0;

  const retratos = [regras, responsaveis, tipos];
  const erro = retratos.some((r) => r.status === "erro");
  const carregando = retratos.some((r) => r.status === "carregando");

  /** As linhas do Mês atual prontas para a reaplicação (nada, se o Mês ainda não carregou). */
  function entradasDe(r: Reaplicar) {
    if (lancamentos.status !== "pronto" || lancamentos.mes !== r.mes) return [];
    return entradasDaReaplicacao(r.chave, r.campos, lancamentos.linhas, r.mes);
  }

  async function salvar(id: string, chave: string, edicao: EdicaoRegra): Promise<boolean> {
    const r = await repoRegras().editar(id, edicao);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return false;
    }
    if (r.regra === null) return true;
    // Só o que a edição trocou por um valor (limpar não tem o que reaplicar).
    const campos: Reaplicar["campos"] = {};
    if (typeof edicao.responsavel_id === "string") campos.responsavel_id = edicao.responsavel_id;
    if (typeof edicao.tipo_id === "string") campos.tipo_id = edicao.tipo_id;
    const proposta: Reaplicar = { chave, campos, mes };
    if (entradasDe(proposta).length > 0) setPergunta(proposta);
    else toast.mostrar({ texto: T.regra_salva });
    return true;
  }

  async function aplicarATodos() {
    if (!pergunta || emCurso.current) return;
    const entradas = entradasDe(pergunta);
    setPergunta(null);
    if (entradas.length === 0) return;
    emCurso.current = true;
    setAplicando(true);
    // Reaplicar não ensina: a contagem e o `ultimo_uso` da Regra ficam como a edição deixou.
    const r = await repoLancamentos().classificarEmLote(entradas, { ensinar: false });
    emCurso.current = false;
    setAplicando(false);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return;
    }
    if (r.gravadas === 0) return;
    toast.mostrar({
      texto: rotuloClassificados(r.gravadas),
      aoDesfazer: () => {
        void repoLancamentos()
          .desfazerLote(r.antes)
          .then((d) => {
            if (!d.ok) toast.mostrar({ texto: mensagem(d.codigo) });
          });
      },
    });
  }

  async function excluir() {
    if (!excluindo) return;
    const r = await repoRegras().excluir(excluindo.id);
    if (!r.ok) toast.mostrar({ texto: mensagem(r.codigo) });
  }

  let conteudo;
  if (erro) {
    conteudo = (
      <ErroAoCarregar
        aoTentarDeNovo={() => {
          void gerenciador("regras").recarregar();
          void gerenciador("responsaveis").recarregar();
          void gerenciador("tipos").recarregar();
        }}
      />
    );
  } else if (carregando) {
    conteudo = (
      <div role="status" aria-busy="true" className="flex flex-col gap-2 p-2">
        <span className="sr-only">{T.carregando}</span>
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-toque" />
        ))}
      </div>
    );
  } else if (regras.linhas.length === 0) {
    conteudo = <EstadoVazio texto={T.vazio} />;
  } else if (lista.length === 0) {
    conteudo = <EstadoVazio texto={T.nenhuma_encontrada} />;
  } else {
    conteudo = (
      <div>
        <div
          aria-hidden
          className={`grid items-center gap-3 border-b border-border px-3.5 pb-2 texto-label text-text-muted ${COLUNAS_REGRA}`}
        >
          <span>{T.coluna_chave}</span>
          <span>{T.coluna_responsavel}</span>
          <span>{T.coluna_tipo}</span>
          <span>{T.coluna_divisao}</span>
          <span>{T.coluna_ultimo_uso}</span>
          <span />
        </div>
        <ul>
          {lista.map((r) => (
            <LinhaRegra
              key={r.id}
              chave={r.chave}
              responsavel={r.responsavel_id === null ? null : (nomes.responsaveis.get(r.responsavel_id) ?? null)}
              outrosResponsaveis={outrosResponsaveisDaRegra(r).flatMap((id) => {
                const nome = nomes.responsaveis.get(id);
                return nome === undefined ? [] : [nome];
              })}
              tipo={r.tipo_id === null ? null : (nomes.tipos.get(r.tipo_id) ?? null)}
              divisao={divisaoEmTexto(r.divisao)}
              ultimoUso={r.ultimo_uso}
              aoEditar={() => setEditandoId(r.id)}
              aoExcluir={() => setExcluindoId(r.id)}
            />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="titulo-regras"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
    >
      <header className="flex flex-wrap items-center gap-3">
        <h2 id="titulo-regras" className="flex-1 texto-body-strong">
          {ROTULOS.regras_aprendidas}
        </h2>
        {!erro && !carregando && regras.linhas.length > 0 ? (
          <div className="w-64">
            <Campo
              rotulo={T.buscar}
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        ) : null}
      </header>

      {criadasDesde ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-selection px-3 py-2 texto-body">
          <p className="min-w-0 flex-1">{rotuloCriadasAgora(doFiltro.length)}</p>
          <Botao asChild tamanho="compacto" variante="secundario">
            <Link href="/configuracoes?secao=regras">{T.mostrar_todas}</Link>
          </Botao>
        </div>
      ) : null}

      {pergunta && mudariam > 0 ? (
        <FaixaPergunta
          pergunta={perguntaReaplicar(pergunta.mes, mudariam)}
          aoResponder={(resposta) => {
            if (resposta === "aplicar_a_todos") void aplicarATodos();
            else {
              setPergunta(null);
              toast.mostrar({ texto: T.regra_salva });
            }
          }}
        />
      ) : null}
      {aplicando ? <span role="status" className="sr-only">{T.carregando}</span> : null}

      {conteudo}

      {editando ? (
        <JanelaEditarRegra
          key={editando.id}
          regra={editando}
          outrosResponsaveis={outrosResponsaveisDaRegra(editando).flatMap((id) => {
            const nome = nomes.responsaveis.get(id);
            return nome === undefined ? [] : [nome];
          })}
          responsaveis={responsaveis.linhas}
          tipos={tipos.linhas}
          divisao={divisaoEmTexto(editando.divisao)}
          aberta
          aoMudar={(aberta) => {
            if (!aberta) setEditandoId(null);
          }}
          aoSalvar={(edicao) => salvar(editando.id, editando.chave, edicao)}
        />
      ) : null}

      <ConfirmarAcao
        aberta={excluindo !== null}
        aoMudar={(aberta) => {
          if (!aberta) setExcluindoId(null);
        }}
        titulo={excluindo ? tituloExcluirRegra(excluindo.chave) : ""}
        descricao={DESCRICAO_EXCLUIR_REGRA}
        rotuloConfirmar={T.confirmar_excluir}
        aoConfirmar={() => void excluir()}
      />
    </section>
  );
}
