"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import type { ContaSalva, ParcelaMantida } from "@/domain/alterar-conta";
import {
  adicionarParte,
  avaliarFormularioConta,
  contaMudou,
  lerNumeroDeParcelas,
  removerParte,
  rascunhoDaConta,
  rascunhoInicialDaConta,
  totalDaConta,
  type NovaConta,
  type RascunhoDaConta,
  type RepeticaoConta,
} from "@/domain/contas-manuais";
import { ehMes } from "@/domain/ciclo";
import { formatarMes } from "@/domain/datas";
import type { MesComHistorico } from "@/domain/historico-do-mes";
import { lerDataCombinada } from "@/domain/divida";
import { opcoesDoCadastro } from "@/domain/lancamento";
import {
  TEXTOS_CONTAS as T,
  mensagem,
  TEXTOS_DIVIDA as TD,
  avisoContaComHistorico,
  rotuloCobrancaDaParte,
  rotuloDataDaParte,
  rotuloFicamComoEstao,
  rotuloRemoverParte,
  rotuloResponsavelDaParte,
  rotuloSomaDasPartes,
  rotuloTotaisDaConta,
  rotuloValeAPartirDe,
  rotuloValorDaParte,
} from "@/domain/mensagens";
import { ativos as responsaveisAtivos, ordenarParaConfiguracoes as ordenarResponsaveis } from "@/domain/responsaveis";
import { ativos as tiposAtivos, ordenarParaConfiguracoes as ordenarTipos } from "@/domain/tipos";
import type { LinhaDe } from "@/data/realtime";
import { AreaTexto } from "@/ui/AreaTexto";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { Janela } from "@/ui/Janela";
import { Seletor } from "@/ui/Seletor";

// Formulário "Nova conta manual" (UX-DR24, mockup `contas-manuais.html`, Flow 5):
// Nome, Valor, Repetição (Mensal até encerrar · N parcelas), Parcelas, "Começa
// em", Tipo, Observação e Divisão (uma linha Responsável + valor por parte, com
// "＋ Parte"). Uma parte só é o Responsável da Conta; duas ou mais dividem o
// Valor (a soma tem que bater). Toda regra e toda mensagem vêm do núcleo
// (`avaliarFormularioConta`); aqui só se digita, mostra e chama `aoSalvar`.
//
// - Os erros aparecem depois do primeiro "Salvar" (e somem conforme se corrige);
//   "Salvar" com erro leva o foco ao primeiro campo inválido.
// - O `id` da Conta nasce com o formulário: tocar duas vezes em "Salvar", ou
//   repetir depois de uma resposta perdida, não cria uma Conta a mais.
// - Sem conexão, "Salvar" fica desativado (AD-3: só consulta).
// - Editar (História 5.4): com `conta`, o formulário abre preenchido, mostra
//   "Vale a partir de Mmm/AA. Os meses anteriores não mudam" e, quando a leitura
//   dos Lançamentos chega, "Ficam como estão: …". O "Começa em" fica travado (os
//   Meses anteriores não mudam e `parcela_n` conta desde ele). Tipo e
//   Responsáveis arquivados que a Conta já usa continuam nas opções (AD-16).
//   Salvar sem mudar nada só fecha.

/** O que o formulário precisa do resultado de gravar: deu certo, ou o código da recusa. */
export type ResultadoDoFormulario = { ok: true } | { ok: false; codigo: string };

export type PropsFormularioConta = {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  /** O Mês atual (`AAAA-MM`), de onde vêm o "Começa em" padrão e os limites. */
  mesAtual: string;
  responsaveis: readonly LinhaDe<"responsaveis">[];
  tipos: readonly LinhaDe<"tipos">[];
  /** Há conexão? Sem ela, "Salvar" fica desativado. */
  online: boolean;
  /** Grava; devolve o resultado do repositório. A janela fecha quando dá certo (quem abre mostra o aviso). */
  aoSalvar: (conta: NovaConta) => Promise<ResultadoDoFormulario>;
  /** Gera o `id` da Conta (padrão: `crypto.randomUUID`); os testes passam um fixo. */
  gerarId?: () => string;
  /** Editando: a Conta como está salva. Sem ela, é "Nova conta". */
  conta?: ContaSalva;
  /**
   * Editando: as parcelas que ficam como estão (a leitura dos Lançamentos da
   * Conta); `null` enquanto a leitura não chegou, e ausente se ela falhou.
   */
  ficam?: readonly ParcelaMantida[] | null;
  /**
   * Conta nova: os Meses de `desde` em diante que já têm histórico da planilha (Defeito 2). Devolve
   * `null` se não deu para ler (nada a avisar). Sem isto, o formulário não avisa.
   */
  lerHistorico?: (desde: string) => Promise<readonly MesComHistorico[] | null>;
};

// "Mensal" ou "Dívida programada" por parte da Divisão (6.6, mockup `contas-manuais.html`).
const OPCOES_COBRANCA = [
  { valor: "mensal", rotulo: TD.mensal },
  { valor: "programada", rotulo: TD.divida_programada },
] as const;

const OPCOES_REPETICAO = [
  { valor: "mensal", rotulo: T.mensal_ate_encerrar },
  { valor: "parcelas", rotulo: T.n_parcelas },
] as const;

export function FormularioConta({
  aberta,
  aoMudar,
  mesAtual,
  responsaveis,
  tipos,
  online,
  aoSalvar,
  gerarId = () => crypto.randomUUID(),
  conta,
  ficam,
  lerHistorico,
}: PropsFormularioConta) {
  const editando = conta !== undefined;
  const [id] = useState(() => conta?.id ?? gerarId());
  const [rascunho, setRascunho] = useState<RascunhoDaConta>(() =>
    conta ? rascunhoDaConta(conta) : rascunhoInicialDaConta(mesAtual),
  );
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const idFormulario = useId();
  const formulario = useRef<HTMLFormElement>(null);

  const responsaveisOrdenados = useMemo(() => ordenarResponsaveis(responsaveisAtivos(responsaveis)), [responsaveis]);
  const tiposOrdenados = useMemo(() => ordenarTipos(tiposAtivos(tipos)), [tipos]);
  // Editando, o que já é da Conta aparece mesmo arquivado (`opcoesDoCadastro` só mantém o atual).
  const responsaveisParaOpcoes = useMemo(
    () => (editando ? ordenarResponsaveis(responsaveis) : responsaveisOrdenados),
    [editando, responsaveis, responsaveisOrdenados],
  );
  const tiposParaOpcoes = useMemo(() => (editando ? ordenarTipos(tipos) : tiposOrdenados), [editando, tipos, tiposOrdenados]);
  const avaliacao = useMemo(
    () =>
      avaliarFormularioConta(id, rascunho, {
        mesAtual,
        tiposAtivos: new Set(tiposOrdenados.map((t) => t.id)),
        responsaveisAtivos: new Set(responsaveisOrdenados.map((r) => r.id)),
        ...(conta ? { original: conta } : {}),
      }),
    [id, rascunho, mesAtual, tiposOrdenados, responsaveisOrdenados, conta],
  );

  const erro = (campo: keyof typeof avaliacao.erros) => (tentou && avaliacao.erros[campo] ? mensagem(avaliacao.erros[campo]) : null);
  const mudar = (parcial: Partial<RascunhoDaConta>) => {
    setFalha(null);
    setRascunho((r) => ({ ...r, ...parcial }));
  };
  const mudarParte = (i: number, parcial: Partial<RascunhoDaConta["partes"][number]>) =>
    mudar({ partes: rascunho.partes.map((p, j) => (j === i ? { ...p, ...parcial } : p)) });

  const parcelada = rascunho.repeticao === "parcelas";
  const varias = rascunho.partes.length > 1;

  // Defeito 2: os Meses a partir do "Começa em" que já têm histórico da planilha (a Conta entra por cima).
  const comecaEmValido = !editando && ehMes(rascunho.comecaEm) ? rascunho.comecaEm : null;
  const [historico, setHistorico] = useState<{ desde: string; meses: readonly MesComHistorico[] } | null>(null);
  useEffect(() => {
    if (comecaEmValido === null || !lerHistorico) return;
    let vivo = true;
    void lerHistorico(comecaEmValido)
      .then((meses) => {
        if (vivo) setHistorico(meses ? { desde: comecaEmValido, meses } : null);
      })
      .catch(() => {
        if (vivo) setHistorico(null);
      });
    return () => {
      vivo = false;
    };
  }, [comecaEmValido, lerHistorico]);
  // A leitura de outro "Começa em" já não vale: só mostra a que é do Mês de agora.
  const mesesComHistoricoAgora = historico !== null && historico.desde === comecaEmValido ? historico.meses : [];
  const comHistorico = mesesComHistoricoAgora.length > 0;
  const opcoesResponsavel = (atual: string | null) => opcoesDoCadastro(responsaveisParaOpcoes, atual, T.escolha_responsavel);
  const valor = avaliacao.valorCentavos;
  const total = totalDaConta(valor, parcelada ? lerNumeroDeParcelas(rascunho.parcelas) : null);
  const noPassado = !editando && /^\d{4}-\d{2}$/.test(rascunho.comecaEm) && rascunho.comecaEm < mesAtual;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (salvando || !online) return;
    setTentou(true);
    if (avaliacao.conta === null) {
      // O foco vai ao primeiro campo inválido (o React ainda não pintou os erros; espera o próximo quadro).
      requestAnimationFrame(() => formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    // Nada mudou: não há o que recriar (trocaria os ids à toa).
    if (conta && !contaMudou(conta, avaliacao.conta)) {
      aoMudar(false);
      return;
    }
    setSalvando(true);
    setFalha(null);
    const r = await aoSalvar(avaliacao.conta);
    // Sem fechar: o `id` fica o mesmo e um novo "Salvar" é seguro.
    if (!r.ok) {
      setFalha(mensagem(r.codigo));
      setSalvando(false);
      return;
    }
    aoMudar(false);
  }

  return (
    <Janela
      aberta={aberta}
      aoMudar={(a) => {
        if (!salvando) aoMudar(a);
      }}
      titulo={editando ? T.titulo_editar : T.titulo_nova}
      descricao={editando ? T.descricao_editar : T.descricao_nova}
      rodape={
        <>
          <Botao onClick={() => aoMudar(false)} disabled={salvando}>
            {T.cancelar}
          </Botao>
          <Botao type="submit" form={idFormulario} variante="primario" disabled={salvando || !online}>
            {salvando ? T.salvando : comHistorico ? T.salvar_mesmo_assim : T.salvar}
          </Botao>
        </>
      }
    >
      <form id={idFormulario} ref={formulario} onSubmit={enviar} noValidate className="flex flex-col gap-4">
        <Campo
          rotulo={T.nome}
          value={rascunho.nome}
          onChange={(e) => mudar({ nome: e.target.value })}
          erro={erro("nome")}
          autoComplete="off"
        />
        <Campo
          rotulo={parcelada ? T.valor_parcela : T.valor}
          value={rascunho.valor}
          onChange={(e) => mudar({ valor: e.target.value })}
          erro={erro("valor")}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Seletor
            rotulo={T.repeticao}
            value={rascunho.repeticao}
            opcoes={OPCOES_REPETICAO}
            onChange={(e) => mudar({ repeticao: e.target.value as RepeticaoConta })}
          />
          {parcelada ? (
            <Campo
              rotulo={T.parcelas}
              value={rascunho.parcelas}
              onChange={(e) => mudar({ parcelas: e.target.value })}
              erro={erro("parcelas")}
              inputMode="numeric"
              autoComplete="off"
            />
          ) : null}
          <Campo
            rotulo={T.comeca_em}
            type="month"
            value={rascunho.comecaEm}
            onChange={(e) => mudar({ comecaEm: e.target.value })}
            erro={erro("comecaEm")}
            placeholder="AAAA-MM"
            disabled={editando}
            {...(editando ? { "aria-describedby": `${idFormulario}-comeca-fixo` } : {})}
          />
        </div>
        {editando ? (
          <p id={`${idFormulario}-comeca-fixo`} className="texto-label font-normal text-text-muted">
            {T.comeca_em_fixo}
          </p>
        ) : null}
        {noPassado ? <p className="texto-label font-normal text-text-muted">{T.nota_passado}</p> : null}
        {comHistorico ? (
          <p role="alert" className="rounded-lg border border-alert-warning-border bg-alert-warning-bg p-3 texto-body">
            {avisoContaComHistorico(mesesComHistoricoAgora)}
          </p>
        ) : null}
        <div className="flex flex-col gap-1">
          <Seletor
            rotulo={T.tipo}
            value={rascunho.tipo_id ?? ""}
            opcoes={opcoesDoCadastro(tiposParaOpcoes, rascunho.tipo_id, T.escolha_tipo)}
            onChange={(e) => mudar({ tipo_id: e.target.value === "" ? null : e.target.value })}
            aria-invalid={erro("tipo") ? true : undefined}
            aria-describedby={erro("tipo") ? `${idFormulario}-tipo-erro` : undefined}
          />
          {erro("tipo") ? (
            <p id={`${idFormulario}-tipo-erro`} className="texto-label font-normal text-danger-fg">
              {erro("tipo")}
            </p>
          ) : null}
        </div>
        <AreaTexto
          rotulo={T.observacao}
          value={rascunho.observacao}
          onChange={(e) => mudar({ observacao: e.target.value })}
          erro={erro("observacao")}
          rows={2}
        />

        <fieldset className="flex flex-col gap-2" aria-describedby={erro("divisao") ? `${idFormulario}-divisao-erro` : undefined}>
          <legend className="texto-label text-text">{varias ? T.divisao : T.responsavel}</legend>
          {rascunho.partes.map((p, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <Seletor
                  rotulo={rotuloResponsavelDaParte(i + 1)}
                  rotuloOculto
                  value={p.responsavel_id ?? ""}
                  opcoes={opcoesResponsavel(p.responsavel_id)}
                  onChange={(e) => mudarParte(i, { responsavel_id: e.target.value === "" ? null : e.target.value })}
                  aria-invalid={tentou && avaliacao.erros.divisao && p.responsavel_id === null ? true : undefined}
                />
              </div>
              {varias ? (
                <div className="w-32 shrink-0">
                  <Campo
                    rotulo={rotuloValorDaParte(i + 1)}
                    rotuloOculto
                    value={p.texto}
                    onChange={(e) => mudarParte(i, { texto: e.target.value })}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                    aria-invalid={tentou && avaliacao.erros.divisao && avaliacao.valoresDasPartes[i] === null ? true : undefined}
                  />
                </div>
              ) : null}
              {varias ? (
                <div className="w-44 shrink-0">
                  <Seletor
                    rotulo={rotuloCobrancaDaParte(i + 1)}
                    rotuloOculto
                    value={p.programada ? "programada" : "mensal"}
                    opcoes={OPCOES_COBRANCA}
                    onChange={(e) => mudarParte(i, { programada: e.target.value === "programada" })}
                  />
                </div>
              ) : null}
              {varias && p.programada ? (
                <div className="w-40 shrink-0">
                  <Campo
                    rotulo={rotuloDataDaParte(i + 1)}
                    rotuloOculto
                    type="date"
                    className="texto-number"
                    value={p.vencimento ?? ""}
                    onChange={(e) => mudarParte(i, { vencimento: e.target.value })}
                    aria-invalid={tentou && !lerDataCombinada(p.vencimento ?? "").ok ? true : undefined}
                  />
                </div>
              ) : null}
              {varias ? (
                <Botao
                  tamanho="compacto"
                  aria-label={rotuloRemoverParte(i + 1)}
                  onClick={() => mudar({ partes: removerParte(rascunho.partes, i) })}
                  className="mb-1.5"
                >
                  <span aria-hidden>✕</span>
                </Botao>
              ) : null}
            </div>
          ))}
          <div>
            <Botao
              aria-label={T.rotulo_mais_parte}
              onClick={() => mudar({ partes: adicionarParte(rascunho.partes, valor) })}
              disabled={rascunho.partes.length >= 10}
            >
              <span aria-hidden>＋</span>
              {T.mais_parte}
            </Botao>
          </div>
          {erro("divisao") ? (
            <p id={`${idFormulario}-divisao-erro`} role="alert" className="texto-label font-normal text-danger-fg">
              {erro("divisao")}
            </p>
          ) : null}
        </fieldset>

        <div aria-live="polite" className="flex flex-col gap-1 texto-body text-text-muted">
          {varias && valor !== null && avaliacao.somaCentavos !== null ? (
            <p>{rotuloSomaDasPartes(avaliacao.somaCentavos, valor, avaliacao.somaCentavos === valor)}</p>
          ) : null}
          {valor !== null ? <p>{rotuloTotaisDaConta(valor, total)}</p> : null}
        </div>

        {editando ? (
          <div aria-live="polite" className="flex flex-col gap-1 texto-body text-text-muted">
            <p>{rotuloValeAPartirDe(formatarMes(mesAtual))}</p>
            {ficam === null ? <p>{T.conferindo}</p> : null}
            {ficam && ficam.length > 0 ? (
              <p>
                {rotuloFicamComoEstao(ficam.map((p) => ({ mesFormatado: formatarMes(p.mes), motivo: p.motivo })))}
              </p>
            ) : null}
          </div>
        ) : null}

        {falha ? (
          <p role="alert" className="texto-body text-danger-fg">
            {falha}
          </p>
        ) : null}
        {!online ? <p className="texto-body text-text-muted">{T.sem_internet}</p> : null}
      </form>
    </Janela>
  );
}
