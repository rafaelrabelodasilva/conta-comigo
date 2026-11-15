"use client";

import { useId, useMemo, useState } from "react";
import { planejarSalvarBloco, type Bloco, type BlocoParaGravar } from "@/domain/blocos";
import { formatarDinheiro } from "@/domain/dinheiro";
import {
  OPERACOES,
  SIMBOLO_OPERACAO,
  avaliar,
  descreverCalculo,
  fichasDaFormula,
  montarFormula,
  nomeDoOperando,
  normalizarNumero,
  textoDaFormula,
  type Ficha,
  type NomesDaFormula,
} from "@/domain/formula";
import { ROTULOS, ROTULO_OPERACAO, TEXTOS_BLOCO as T, mensagem, rotuloRemoverFicha } from "@/domain/mensagens";
import { projetarPainel, type LancamentoParaProjetar } from "@/domain/projecoes";
import { ativos as responsaveisAtivos, type Responsavel } from "@/domain/responsaveis";
import { ativos as tiposAtivos, type Tipo } from "@/domain/tipos";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { classesPessoa } from "@/ui/cores-pessoa";
import { Interruptor } from "@/ui/Interruptor";
import { Janela } from "@/ui/Janela";
import { Seletor } from "@/ui/Seletor";

// Janela "Montador de Bloco" (UX-DR16, mockup `montador-bloco.html`, FR-19,
// FR-54): nome, área da Fórmula com as fichas (tocar numa ficha a remove),
// paleta (Responsáveis com a bolinha, Tipos, "Todos", "Responsável em Tipo…"
// com dois seletores, "Número…" e as teclas + − × ÷ ( )), resultado e passo a
// passo ao vivo e as opções "Usar em Recebimentos" e "É o meu Bloco". Não há
// campo de texto livre para a Fórmula. Quem decide se a Fórmula vale é o
// núcleo (`montarFormula`, `planejarSalvarBloco`): "Salvar" fica desativado
// com a razão numa linha. O resultado é a Fórmula sobre `projetarPainel` do
// Mês aberto. A gravação é de quem abre a janela (`aoSalvar`).
//
// "Ver cálculo" (História 4.2): com `somenteLeitura`, a mesma janela mostra o
// Bloco `inicial` sem paleta nem campos: nome, fichas, resultado e passo a
// passo (a mesma `avaliar` sobre a mesma `projetarPainel` do `block-card`,
// então é o mesmo número) e só "Fechar".

export type PropsMontadorBloco = {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  /** Os Lançamentos do Mês aberto (a memória do Painel). */
  linhas: readonly LancamentoParaProjetar[];
  mes: string;
  responsaveis: readonly Responsavel[];
  tipos: readonly Tipo[];
  /** Os Blocos que já existem (nome único e próxima ordem). */
  blocos: readonly Bloco[];
  /** Editar este Bloco, em vez de criar um novo. */
  inicial?: Bloco;
  /** Grava; devolve se deu certo (a janela se fecha). */
  aoSalvar: (pedido: BlocoParaGravar) => Promise<boolean>;
  /** "Ver cálculo": mostra o Bloco `inicial` sem editar (não grava). */
  somenteLeitura?: boolean;
};

const CHIP =
  "inline-flex min-h-toque cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background px-3 texto-body-strong text-text";
const TECLA =
  "inline-flex size-toque cursor-pointer items-center justify-center rounded-sm border border-border bg-background texto-title text-text";

function textoDaFicha(f: Ficha, nomes: NomesDaFormula): string {
  switch (f.tipo) {
    case "operacao":
      return SIMBOLO_OPERACAO[f.operacao];
    case "abre":
      return "(";
    case "fecha":
      return ")";
    case "numero":
      return f.valor;
    default:
      return nomeDoOperando(f, nomes);
  }
}

export function MontadorBloco({
  aberta,
  aoMudar,
  linhas,
  mes,
  responsaveis,
  tipos,
  blocos,
  inicial,
  aoSalvar,
  somenteLeitura = false,
}: PropsMontadorBloco) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [fichas, setFichas] = useState<Ficha[]>(() => (inicial ? fichasDaFormula(inicial.formula) : []));
  const [deCobranca, setDeCobranca] = useState(inicial?.de_cobranca ?? false);
  const [meuBloco, setMeuBloco] = useState(inicial?.meu_bloco ?? false);
  const [painelAberto, setPainelAberto] = useState<"numero" | "responsavel_em_tipo" | null>(null);
  const [numero, setNumero] = useState("");
  const [respEmTipo, setRespEmTipo] = useState({ responsavel: "", tipo: "" });
  const [trabalhando, setTrabalhando] = useState(false);
  const idNome = useId();
  const idRazao = useId();

  const nomes = useMemo<NomesDaFormula>(
    () => ({
      responsaveis: new Map(responsaveis.map((r) => [r.id, r.nome])),
      tipos: new Map(tipos.map((t) => [t.id, t.nome])),
    }),
    [responsaveis, tipos],
  );
  const listaResponsaveis = responsaveisAtivos(responsaveis);
  const listaTipos = tiposAtivos(tipos);

  // O resultado ao vivo: a Fórmula sobre as linhas do Painel do Mês aberto.
  const projecao = useMemo(() => projetarPainel(linhas, mes), [linhas, mes]);
  const montada = useMemo(() => montarFormula(fichas), [fichas]);
  const avaliacao = useMemo(() => {
    // "Ver cálculo" avalia a Fórmula gravada do Bloco; o Montador, a que está sendo montada.
    const formula = somenteLeitura && inicial ? { ok: true as const, valor: inicial.formula } : montada;
    if (!formula.ok) return null;
    const a = avaliar(formula.valor, projecao);
    return a.ok ? a.valor : null;
  }, [montada, projecao, somenteLeitura, inicial]);

  const plano = planejarSalvarBloco({ nome, fichas, de_cobranca: deCobranca, meu_bloco: meuBloco }, blocos, inicial?.id);
  // A razão do "Salvar" desativado; um valor grande demais só aparece com os dados.
  const razao = !plano.ok ? plano.erro.codigo : montada.ok && avaliacao === null ? "formula.valor_grande" : null;
  const podeSalvar = plano.ok && avaliacao !== null && !trabalhando;

  const incluir = (ficha: Ficha) => setFichas((f) => [...f, ficha]);
  const numeroNormalizado = normalizarNumero(numero);

  function usarNumero() {
    if (numeroNormalizado === null) return;
    incluir({ tipo: "numero", valor: numeroNormalizado });
    setNumero("");
    setPainelAberto(null);
  }

  function usarResponsavelEmTipo() {
    if (respEmTipo.responsavel === "" || respEmTipo.tipo === "") return;
    incluir({ tipo: "responsavel_em_tipo", responsavel_id: respEmTipo.responsavel, tipo_id: respEmTipo.tipo });
    setRespEmTipo({ responsavel: "", tipo: "" });
    setPainelAberto(null);
  }

  async function salvar() {
    if (!plano.ok || !podeSalvar) return;
    setTrabalhando(true);
    const ok = await aoSalvar(plano.valor);
    setTrabalhando(false);
    if (ok) aoMudar(false);
  }

  const semCadastros = listaResponsaveis.length === 0 && listaTipos.length === 0;

  if (somenteLeitura && inicial) {
    return (
      <Janela
        aberta={aberta}
        aoMudar={aoMudar}
        titulo={T.titulo_ver_calculo}
        descricao={T.descricao_ver_calculo}
        className="max-w-3xl"
        rodape={<Botao onClick={() => aoMudar(false)}>{T.fechar}</Botao>}
      >
        <div className="flex flex-col gap-3">
          <p className="texto-title text-text">{inicial.nome}</p>
          <div className="flex flex-col gap-1">
            <span className="texto-label text-text">{T.formula}</span>
            <p className="texto-body-strong text-text">{textoDaFormula(inicial.formula, nomes)}</p>
          </div>
          <div className="flex flex-col gap-1 rounded-md bg-background p-3">
            <div className="flex items-baseline gap-2.5">
              <span className="texto-body text-text-muted">{T.resultado}</span>
              <b className="texto-block-value text-text">{avaliacao ? formatarDinheiro(avaliacao.valorCentavos) : T.sem_valor}</b>
            </div>
            {avaliacao ? (
              <p aria-label={T.passo_a_passo} className="texto-number text-text-muted">
                {descreverCalculo(avaliacao, nomes)}
                <span className="texto-caption"> · {T.arredondado}</span>
              </p>
            ) : null}
          </div>
          {inicial.de_cobranca || inicial.meu_bloco ? (
            <ul className="flex flex-col gap-0.5 texto-body text-text-muted">
              {inicial.de_cobranca ? <li>{T.usado_em_recebimentos}</li> : null}
              {inicial.meu_bloco ? <li>{T.e_meu_bloco}</li> : null}
            </ul>
          ) : null}
        </div>
      </Janela>
    );
  }

  return (
    <Janela
      aberta={aberta}
      aoMudar={aoMudar}
      titulo={inicial ? T.titulo_editar : T.titulo}
      descricao={T.descricao}
      className="max-w-3xl"
      rodape={
        <>
          <Botao onClick={() => aoMudar(false)}>{ROTULOS.cancelar}</Botao>
          <Botao variante="primario" disabled={!podeSalvar} aria-describedby={idRazao} onClick={() => void salvar()}>
            {T.salvar}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={idNome} className="texto-label text-text">
            {T.nome}
          </label>
          <input
            id={idNome}
            autoComplete="off"
            maxLength={30}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="min-h-toque w-full rounded-sm border border-border bg-background px-3 texto-body text-text"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="texto-label text-text" id={`${idNome}-formula`}>
            {T.formula}
          </span>
          <div
            role="group"
            aria-labelledby={`${idNome}-formula`}
            className="flex min-h-14 flex-wrap items-center gap-1 rounded-md border-2 border-dashed border-border p-2"
          >
            {fichas.map((f, i) => {
              const texto = textoDaFicha(f, nomes);
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={rotuloRemoverFicha(texto)}
                  onClick={() => setFichas((fs) => fs.filter((_, j) => j !== i))}
                  className="area-toque min-h-9 cursor-pointer rounded-sm border border-accent-line bg-selection px-2.5 texto-body-strong text-text"
                >
                  {texto}
                </button>
              );
            })}
            <span className="ml-1 texto-caption text-text-muted">{fichas.length === 0 ? T.dica_vazia : T.dica_remover}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          {semCadastros ? <p className="texto-body text-text-muted">{T.sem_fichas}</p> : null}
          {listaResponsaveis.length > 0 ? (
            <section aria-label={T.responsaveis} className="flex flex-col gap-1">
              <span className="texto-label text-text-muted">{T.responsaveis}</span>
              <div className="flex flex-wrap gap-1.5">
                {listaResponsaveis.map((r) => (
                  <button key={r.id} type="button" className={CHIP} onClick={() => incluir({ tipo: "responsavel", id: r.id })}>
                    <span aria-hidden className={cn("size-2 rounded-full", classesPessoa(r.cor).fundo)} />
                    {r.nome}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {listaTipos.length > 0 ? (
            <section aria-label={T.tipos} className="flex flex-col gap-1">
              <span className="texto-label text-text-muted">{T.tipos}</span>
              <div className="flex flex-wrap gap-1.5">
                {listaTipos.map((t) => (
                  <button key={t.id} type="button" className={CHIP} onClick={() => incluir({ tipo: "tipo", id: t.id })}>
                    {t.nome}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <section aria-label={T.operacoes} className="flex flex-col gap-1">
            <span className="texto-label text-text-muted">{T.operacoes}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {OPERACOES.map((operacao) => (
                <button
                  key={operacao}
                  type="button"
                  aria-label={ROTULO_OPERACAO[operacao]}
                  className={TECLA}
                  onClick={() => incluir({ tipo: "operacao", operacao })}
                >
                  <span aria-hidden>{SIMBOLO_OPERACAO[operacao]}</span>
                </button>
              ))}
              <button type="button" aria-label={T.abrir_parentese} className={TECLA} onClick={() => incluir({ tipo: "abre" })}>
                <span aria-hidden>(</span>
              </button>
              <button type="button" aria-label={T.fechar_parentese} className={TECLA} onClick={() => incluir({ tipo: "fecha" })}>
                <span aria-hidden>)</span>
              </button>
              <button type="button" className={CHIP} onClick={() => incluir({ tipo: "todos" })}>
                {T.todos}
              </button>
              <button
                type="button"
                aria-expanded={painelAberto === "numero"}
                className={CHIP}
                onClick={() => setPainelAberto((p) => (p === "numero" ? null : "numero"))}
              >
                {T.numero}
              </button>
              <button
                type="button"
                aria-expanded={painelAberto === "responsavel_em_tipo"}
                disabled={listaResponsaveis.length === 0 || listaTipos.length === 0}
                className={cn(CHIP, "disabled:cursor-not-allowed disabled:opacity-50")}
                onClick={() => setPainelAberto((p) => (p === "responsavel_em_tipo" ? null : "responsavel_em_tipo"))}
              >
                {T.responsavel_em_tipo}
              </button>
            </div>
          </section>

          {painelAberto === "numero" ? (
            <div className="flex items-end gap-2 rounded-md bg-background p-2.5">
              <div className="flex flex-col gap-1">
                <label htmlFor={`${idNome}-numero`} className="texto-label text-text">
                  {T.campo_numero}
                </label>
                <input
                  id={`${idNome}-numero`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="2"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      usarNumero();
                    }
                  }}
                  className="min-h-toque w-32 rounded-sm border border-border bg-surface px-3 texto-number text-text"
                />
              </div>
              <Botao variante="primario" disabled={numeroNormalizado === null} onClick={usarNumero}>
                {T.usar_numero}
              </Botao>
            </div>
          ) : null}

          {painelAberto === "responsavel_em_tipo" ? (
            <div className="flex flex-wrap items-end gap-2 rounded-md bg-background p-2.5">
              <Seletor
                rotulo={T.responsavel}
                value={respEmTipo.responsavel}
                onChange={(e) => setRespEmTipo((v) => ({ ...v, responsavel: e.target.value }))}
                opcoes={[{ valor: "", rotulo: "" }, ...listaResponsaveis.map((r) => ({ valor: r.id, rotulo: r.nome }))]}
              />
              <Seletor
                rotulo={T.tipo}
                value={respEmTipo.tipo}
                onChange={(e) => setRespEmTipo((v) => ({ ...v, tipo: e.target.value }))}
                opcoes={[{ valor: "", rotulo: "" }, ...listaTipos.map((t) => ({ valor: t.id, rotulo: t.nome }))]}
              />
              <Botao
                variante="primario"
                disabled={respEmTipo.responsavel === "" || respEmTipo.tipo === ""}
                onClick={usarResponsavelEmTipo}
              >
                {T.usar}
              </Botao>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-1 rounded-md bg-background p-3" aria-live="polite">
          <div className="flex items-baseline gap-2.5">
            <span className="texto-body text-text-muted">{T.resultado}</span>
            <b className="texto-block-value text-text">{avaliacao ? formatarDinheiro(avaliacao.valorCentavos) : "—"}</b>
          </div>
          {avaliacao ? (
            <p aria-label={T.passo_a_passo} className="texto-number text-text-muted">
              {descreverCalculo(avaliacao, nomes)}
              <span className="texto-caption"> · {T.arredondado}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-x-5">
          <Interruptor rotulo={T.usar_em_recebimentos} ligado={deCobranca} aoMudar={setDeCobranca} />
          <Interruptor rotulo={T.meu_bloco} ligado={meuBloco} aoMudar={setMeuBloco} />
        </div>

        <p id={idRazao} role="status" className="min-h-5 texto-body text-text-muted">
          {razao ? mensagem(razao) : ""}
        </p>
      </div>
    </Janela>
  );
}
