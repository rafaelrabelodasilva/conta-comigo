"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import {
  adicionarParte,
  avaliarFormularioConta,
  lerNumeroDeParcelas,
  removerParte,
  rascunhoInicialDaConta,
  totalDaConta,
  type NovaConta,
  type RascunhoDaConta,
  type RepeticaoConta,
} from "@/domain/contas-manuais";
import { opcoesDoCadastro } from "@/domain/lancamento";
import {
  TEXTOS_CONTAS as T,
  mensagem,
  rotuloRemoverParte,
  rotuloResponsavelDaParte,
  rotuloSomaDasPartes,
  rotuloTotaisDaConta,
  rotuloValorDaParte,
} from "@/domain/mensagens";
import { ativos as responsaveisAtivos, ordenarParaConfiguracoes as ordenarResponsaveis } from "@/domain/responsaveis";
import { ativos as tiposAtivos, ordenarParaConfiguracoes as ordenarTipos } from "@/domain/tipos";
import type { ResultadoSalvarConta } from "@/data/contas-repo";
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
  aoSalvar: (conta: NovaConta) => Promise<ResultadoSalvarConta>;
  /** Gera o `id` da Conta (padrão: `crypto.randomUUID`); os testes passam um fixo. */
  gerarId?: () => string;
};

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
}: PropsFormularioConta) {
  const [id] = useState(gerarId);
  const [rascunho, setRascunho] = useState<RascunhoDaConta>(() => rascunhoInicialDaConta(mesAtual));
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const idFormulario = useId();
  const formulario = useRef<HTMLFormElement>(null);

  const responsaveisOrdenados = useMemo(() => ordenarResponsaveis(responsaveisAtivos(responsaveis)), [responsaveis]);
  const tiposOrdenados = useMemo(() => ordenarTipos(tiposAtivos(tipos)), [tipos]);
  const avaliacao = useMemo(
    () =>
      avaliarFormularioConta(id, rascunho, {
        mesAtual,
        tiposAtivos: new Set(tiposOrdenados.map((t) => t.id)),
        responsaveisAtivos: new Set(responsaveisOrdenados.map((r) => r.id)),
      }),
    [id, rascunho, mesAtual, tiposOrdenados, responsaveisOrdenados],
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
  const opcoesResponsavel = (atual: string | null) => opcoesDoCadastro(responsaveisOrdenados, atual, T.escolha_responsavel);
  const valor = avaliacao.valorCentavos;
  const total = totalDaConta(valor, parcelada ? lerNumeroDeParcelas(rascunho.parcelas) : null);
  const noPassado = /^\d{4}-\d{2}$/.test(rascunho.comecaEm) && rascunho.comecaEm < mesAtual;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (salvando || !online) return;
    setTentou(true);
    if (avaliacao.conta === null) {
      // O foco vai ao primeiro campo inválido (o React ainda não pintou os erros; espera o próximo quadro).
      requestAnimationFrame(() => formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
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
      titulo={T.titulo_nova}
      descricao={T.descricao_nova}
      rodape={
        <>
          <Botao onClick={() => aoMudar(false)} disabled={salvando}>
            {T.cancelar}
          </Botao>
          <Botao type="submit" form={idFormulario} variante="primario" disabled={salvando || !online}>
            {salvando ? T.salvando : T.salvar}
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
          />
        </div>
        {noPassado ? <p className="texto-label font-normal text-text-muted">{T.nota_passado}</p> : null}
        <div className="flex flex-col gap-1">
          <Seletor
            rotulo={T.tipo}
            value={rascunho.tipo_id ?? ""}
            opcoes={opcoesDoCadastro(tiposOrdenados, rascunho.tipo_id, T.escolha_tipo)}
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
            <div key={i} className="flex items-end gap-2">
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
