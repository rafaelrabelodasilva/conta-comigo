"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { chavesDeRegrasUsadas, classificarImportacao } from "@/domain/classificacao";
import { LIMITE_AJUSTE_PADRAO_CENTAVOS } from "@/domain/configuracoes";
import { removerDadosPessoais } from "@/domain/dados-pessoais";
import type { CandidataParaHerdar } from "@/domain/heranca";
import {
  conferirImportacao,
  pareceFaturaSantander,
  prepararImportacao,
  resumirReimportacao,
  type ConferenciaImportacao,
  type Importacao,
  type LancamentoParaGravar,
  type ResumoReimportacao,
} from "@/domain/importacao-fatura";
import {
  ETAPAS_IMPORTACAO,
  ROTULOS,
  TEXTOS_IMPORTAR as T,
  TEXTOS_REVISAR,
  avisoReimportar,
  avisoReimportarBloqueado,
  mensagem,
  rotuloConferencia,
  rotuloDespesasCreditos,
  rotuloPassoImportar,
  rotuloReimportado,
  rotuloResumoClassificacao,
  rotuloDivididosPelaRegra,
  rotuloParcelasHerdadas,
  rotuloPrevistosCasados,
  rotuloPrevistosCriados,
  rotuloPrevistosNaoVieram,
  rotuloSeraoGravados,
  textoExtracaoIncompleta,
  tituloFaturaLida,
  type EtapaImportacao,
} from "@/domain/mensagens";
import { aplicarCasamento, casarPrevistos, gerarPrevistos } from "@/domain/previstos";
import type { RegraGravada } from "@/domain/regras";
import type { Resultado } from "@/domain/resultado";
import { resumoDaClassificacao } from "@/domain/revisar";
import { repoFaturas, type LeituraDePrevistos, type Substituir } from "@/data/faturas-repo";
import { repoRegras } from "@/data/regras-repo";
import { useLinhas } from "@/data/realtime";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { Janela } from "@/ui/Janela";
import { useToast } from "@/ui/Toast";
import { CANCELADO, extrairTexto } from "./extrair";
import { lerPdf, type PdfLido } from "./ler-pdf";
import { TotalAPagar } from "./TotalAPagar";

// Janela "Importar fatura" (UX-DR20, História 2.3), em 3 passos: PDF, senha
// e conferir. O PDF e a senha ficam no aparelho (pdf.js); só o texto sem
// dados pessoais vai para a leitura. O núcleo prepara as linhas e a
// Conferência, e o repositório grava tudo ou nada pela RPC. "Cancelar"
// interrompe sem gravar, mas fica desligado enquanto a RPC grava.
//
// Classificação (História 3.1): na etapa "classificando", lê as Regras do
// dono e classifica pelo núcleo (`classificarImportacao`) com os
// Responsáveis e Tipos da memória, só depois de os dois estarem "pronto"
// (espera o carregamento). Falhou ao ler as Regras: importa sem elas (só
// com o `tipo_sugerido`); falhou ao ler os cadastros: importa sem
// classificação. Nenhum dos dois bloqueia: a espera tem limite
// (`LIMITE_CLASSIFICAR_MS`); passado o limite, segue como se tivesse falhado.
// Cancelar, recomeçar ou fechar a janela solta as esperas pendentes.
//
// Reimportação (História 3.11 simplificada): se o Mês já tem Fatura (na
// memória, ao classificar; ou depois, pelo Realtime ou pelo erro
// `fatura.mes_ja_importado` da RPC), lê do banco as linhas dela e o passo 3
// mostra o aviso com os números do núcleo (`resumirReimportacao`), com
// "Cancelar" e "Importar de novo" (destrutivo, um toque grava). Sem os
// números (falha ao ler), só o erro e "Tentar de novo", que relê só o
// resumo. A RPC recebe o id da Fatura e o `updated_at` lidos com o aviso;
// `fatura.mes_mudou` volta ao erro com "Tentar de novo" (números novos).
//
// Casamento (História 3.6): ao classificar, lê do banco os previstos do Mês
// importado (e o `updated_at` do Mês, que vai como trava para a RPC); o núcleo
// (`casarPrevistos`, `aplicarCasamento`) junta cada parcela real ao seu previsto
// e marca os previstos que a Fatura não trouxe. O passo 3 diz quantos casaram e
// quantos não vieram. Falhou ao ler os previstos: importa sem casar (a RPC
// recusa se isso criaria duas linhas para a mesma parcela). Fatura com linhas
// casadas não reimporta: o aviso só tem "Cancelar" (a RPC recusa também).
//
// Herança (História 3.7): junto dos previstos, lê do banco as parcelas n−1 do
// Mês anterior (`lerParcelasDoMesAnterior`; a memória guarda só o Mês aberto).
// As parcelas n > 1 que ficaram sem previsto herdam a classificação da n−1 de
// mesmo Nome e Valor (`aplicarCasamento`, `heranca.ts`) e o passo 3 diz quantas.
// Falhou ao ler ou passou do limite: importa sem herdar, como as Regras.
//
// Depois de gravar (História 3.2): com linhas para revisar, o passo 3 mostra
// "N classificados · N para revisar" com "Ir para revisão" (principal) e "Ver
// no Painel"; sem nenhuma, a janela fecha como antes. O Mês importado já foi
// entregue ao Painel (`aoImportar`) quando o passo aparece.

/** Quanto a etapa "classificando" espera as Regras e os cadastros, em ms. */
export const LIMITE_CLASSIFICAR_MS = 10_000;

const ORDEM_ETAPAS = Object.keys(ETAPAS_IMPORTACAO) as EtapaImportacao[];

type Passo = 1 | 2 | 3;

/** O aviso "Importar de novo" do passo 3 (null: o Mês não tinha Fatura). */
type AvisoReimportar =
  | { tipo: "lendo" }
  | { tipo: "pronto"; substituir: Substituir; resumo: ResumoReimportacao }
  | { tipo: "falhou"; codigo: string }
  /** Lido do banco: o Mês não tem Fatura (importação normal). */
  | { tipo: "sem_fatura" };

const AVISO_NO_LIMITE: AvisoReimportar = { tipo: "falhou", codigo: "carregar.falhou" };

type Estado =
  | { tipo: "arquivo"; erro: string | null; naoSantander: boolean }
  | { tipo: "senha"; erro: string | null }
  | { tipo: "processando"; passo: Passo; etapa: EtapaImportacao }
  | { tipo: "falha_leitura"; codigo: string }
  /** Gravou e há linhas para revisar: o resumo e os dois caminhos. */
  | { tipo: "concluido"; classificados: number; paraRevisar: number; casados: number; naoVieram: number; herdadas: number; divididas: number }
  | {
      tipo: "conferir";
      importacao: Importacao;
      conferencia: ConferenciaImportacao;
      gravando: boolean;
      erro: string | null;
      reimportar: AvisoReimportar | null;
    };

const INICIAL: Estado = { tipo: "arquivo", erro: null, naoSantander: false };

/** Dá a vez ao navegador para a etapa nova aparecer na barra de progresso. */
function deixarDesenhar(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function passoDo(estado: Estado): Passo {
  if (estado.tipo === "arquivo") return 1;
  if (estado.tipo === "senha") return 2;
  if (estado.tipo === "processando") return estado.passo;
  return 3;
}

export type PropsImportarFatura = {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  /** Gravou: o Mês importado (`AAAA-MM`), para o Painel abri-lo. */
  aoImportar?: (mes: string) => void;
  /** "Ir para revisão", no passo final com linhas para revisar. */
  aoIrParaRevisao?: () => void;
};

export function ImportarFatura({ aberta, aoMudar, aoImportar, aoIrParaRevisao }: PropsImportarFatura) {
  const [estado, setEstado] = useState<Estado>(INICIAL);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const toast = useToast();
  const { linhas: faturas } = useLinhas("faturas");
  // O limite do Ajuste de centavos (Configurações → Conferência e atraso).
  const { linhas: configuracoes } = useLinhas("configuracoes");
  const limiteAjuste = configuracoes[0]?.limite_ajuste_centavos ?? LIMITE_AJUSTE_PADRAO_CENTAVOS;
  // Numa ref: o aviso é lido depois de esperas e usa as atuais.
  const atuais = useRef({ faturas });
  // Cadastros para classificar (arquivado conta como ausente).
  const { linhas: responsaveis, status: statusResponsaveis } = useLinhas("responsaveis");
  const { linhas: tipos, status: statusTipos } = useLinhas("tipos");
  const statusCadastros =
    statusResponsaveis === "erro" || statusTipos === "erro"
      ? "erro"
      : statusResponsaveis === "pronto" && statusTipos === "pronto"
        ? "pronto"
        : "carregando";
  // Numa ref: a classificação roda depois de esperas (leitura, Regras) e usa os atuais.
  const cadastros = useRef({ responsaveis, tipos, status: statusCadastros });
  // Quem espera os cadastros saírem de "carregando".
  const esperandoCadastros = useRef<(() => void)[]>([]);
  // As esperas da classificação ainda pendentes (cada uma solta com o valor do limite).
  const esperas = useRef(new Set<() => void>());
  useEffect(() => {
    const pendentes = esperas.current;
    return () => {
      for (const soltar of [...pendentes]) soltar();
    };
  }, []);
  useEffect(() => {
    atuais.current = { faturas };
    cadastros.current = { responsaveis, tipos, status: statusCadastros };
    if (statusCadastros !== "carregando") {
      const esperando = esperandoCadastros.current;
      esperandoCadastros.current = [];
      for (const continuar of esperando) continuar();
    }
  });
  // O texto já limpo: "Tentar de novo" reenvia o mesmo, sem pedir PDF e senha.
  const textoLimpo = useRef<string | null>(null);
  const controle = useRef<AbortController | null>(null);
  // Cada tentativa tem um número; o resultado de uma cancelada é ignorado.
  const geracao = useRef(0);
  // Trava contra dois toques rápidos em Importar (o estado ainda é o antigo).
  const gravandoAgora = useRef(false);
  // As chaves das Regras que a classificação usou (para o `ultimo_uso`, depois de gravar).
  const regrasUsadasNaImportacao = useRef<string[]>([]);
  // O `updated_at` do Mês lido junto dos previstos do casamento: a trava da RPC.
  const previstosLidosEm = useRef<{ mes: string; atualizadoEm: string | null } | null>(null);
  // O que o casamento precisa para ser refeito se os previstos do Mês mudarem antes de gravar.
  const planoDoCasamento = useRef<{
    mes: string;
    base: Importacao;
    classificadas: LancamentoParaGravar[];
    candidatas: CandidataParaHerdar[];
  } | null>(null);

  const gravando = estado.tipo === "conferir" && estado.gravando;

  function reiniciar() {
    soltarEsperas();
    controle.current?.abort();
    controle.current = null;
    geracao.current++;
    textoLimpo.current = null;
    previstosLidosEm.current = null;
    planoDoCasamento.current = null;
    setEstado(INICIAL);
    setArquivo(null);
    setSenha("");
  }

  function fechar() {
    if (gravando) return;
    reiniciar();
    aoMudar(false);
  }

  async function lerTexto(texto: string, minha: number) {
    soltarEsperas();
    setEstado({ tipo: "processando", passo: 3, etapa: "lendo" });
    const c = new AbortController();
    controle.current = c;
    const lida = await extrairTexto(texto, c.signal);
    if (minha !== geracao.current) return;
    controle.current = null;
    if (!lida.ok) {
      if (lida.erro.codigo !== CANCELADO) setEstado({ tipo: "falha_leitura", codigo: lida.erro.codigo });
      return;
    }

    setEstado({ tipo: "processando", passo: 3, etapa: "conferindo" });
    await deixarDesenhar();
    if (minha !== geracao.current) return;
    const importacao = prepararImportacao(lida.valor, limiteAjuste);
    if (!importacao.ok) {
      setEstado({ tipo: "falha_leitura", codigo: importacao.erro.codigo });
      return;
    }
    // Sem nenhum Lançamento, gravar só bloquearia o Mês: é leitura que falhou.
    if (importacao.valor.lancamentos.length === 0) {
      setEstado({ tipo: "falha_leitura", codigo: "fatura.leitura_falhou" });
      return;
    }
    const conferencia = conferirImportacao(lida.valor);
    setEstado({ tipo: "processando", passo: 3, etapa: "classificando" });
    await deixarDesenhar();
    if (minha !== geracao.current) return;
    const mes = importacao.valor.fatura.mes;
    const temFatura = atuais.current.faturas.some((f) => f.mes === mes);
    const [lidas, prontos, reimportar, previstosLidos, candidatas] = await Promise.all([
      comLimite(lerRegras(), []),
      esperarCadastros(),
      temFatura ? comLimite(lerAviso(mes), AVISO_NO_LIMITE) : Promise.resolve(null),
      comLimite(lerPrevistos(mes), null),
      comLimite(lerCandidatas(mes), []),
    ]);
    if (minha !== geracao.current) return;
    const { responsaveis: r, tipos: t } = cadastros.current;
    const paraClassificar = prontos ? { responsaveis: r, tipos: t } : { responsaveis: [], tipos: [] };
    const classificadas = classificarImportacao(importacao.valor.lancamentos, lidas, paraClassificar);
    planoDoCasamento.current = { mes, base: importacao.valor, classificadas, candidatas };
    const classificada = montarComCasamento(importacao.valor, classificadas, previstosLidos, candidatas);
    // As Regras que esta importação usou: ganham `ultimo_uso` quando a Fatura for gravada.
    regrasUsadasNaImportacao.current = chavesDeRegrasUsadas(importacao.valor.lancamentos, lidas, paraClassificar);
    setEstado({ tipo: "conferir", importacao: classificada, conferencia, gravando: false, erro: null, reimportar });
  }

  /**
   * Casa as parcelas reais com os previstos lidos do Mês (`casarPrevistos`,
   * `aplicarCasamento`) e gera os previstos novos; guarda o `updated_at` do
   * Mês lido junto, que vai como trava para a RPC (História 3.6).
   */
  function montarComCasamento(
    base: Importacao,
    classificadas: LancamentoParaGravar[],
    previstosLidos: LeituraDePrevistos | null,
    candidatas: readonly CandidataParaHerdar[],
  ): Importacao {
    const mes = base.fatura.mes;
    const previstosDoMes = previstosLidos?.previstos ?? [];
    const casamento = casarPrevistos(classificadas, previstosDoMes);
    const lancamentos = aplicarCasamento(classificadas, casamento, previstosDoMes, candidatas);
    previstosLidosEm.current = previstosLidos ? { mes, atualizadoEm: previstosLidos.atualizadoEm } : null;
    // Previstos (História 3.5): copiam a classificação já calculada; Mês que já tem Fatura fica de fora.
    return {
      ...base,
      lancamentos,
      previstos: gerarPrevistos(
        lancamentos,
        mes,
        atuais.current.faturas.map((f) => f.mes),
      ),
      previstos_sem_par: casamento.semPar,
    };
  }

  /**
   * Os previstos do Mês mudaram depois da leitura (`fatura.mes_mudou`): relê
   * e refaz o casamento com as mesmas linhas já classificadas, para o "Tentar
   * de novo" gravar com o plano e a trava novos. Falhou ao ler → null (fica o plano de antes).
   */
  async function refazerCasamento(mes: string): Promise<Importacao | null> {
    const plano = planoDoCasamento.current;
    if (!plano || plano.mes !== mes) return null;
    const lidos = await lerPrevistos(mes);
    if (!lidos) return null;
    return montarComCasamento(plano.base, plano.classificadas, lidos, plano.candidatas);
  }

  /** As parcelas n−1 do Mês anterior, do banco; falhou → nenhuma (importa sem herdar). */
  async function lerCandidatas(mes: string): Promise<CandidataParaHerdar[]> {
    try {
      const r = await repoFaturas().lerParcelasDoMesAnterior(mes);
      return r.ok ? r.candidatas : [];
    } catch {
      return [];
    }
  }

  /** Os previstos do Mês e o `updated_at` do Mês, do banco; falhou → null (importa sem casar). */
  async function lerPrevistos(mes: string): Promise<LeituraDePrevistos | null> {
    try {
      const r = await repoFaturas().lerPrevistosDoMes(mes);
      return r.ok ? { previstos: r.previstos, atualizadoEm: r.atualizadoEm } : null;
    } catch {
      return null;
    }
  }

  /** Os números do aviso, das linhas da Fatura do Mês lidas do banco. */
  async function lerAviso(mes: string): Promise<AvisoReimportar> {
    try {
      const r = await repoFaturas().lerReimportacao(mes);
      if (!r.ok) return { tipo: "falhou", codigo: r.codigo };
      if (!r.valor) return { tipo: "sem_fatura" };
      const { linhas, statusPadraoId, previstosAApagar, ...substituir } = r.valor;
      return { tipo: "pronto", substituir, resumo: resumirReimportacao(linhas, statusPadraoId, previstosAApagar) };
    } catch {
      return AVISO_NO_LIMITE;
    }
  }

  /** Lê o aviso no passo 3 (sem chamar a leitura da Fatura de novo) e o põe no estado. */
  async function buscarAviso(mes: string) {
    const minha = geracao.current;
    const aviso = await comLimite(lerAviso(mes), AVISO_NO_LIMITE);
    if (minha !== geracao.current) return;
    setEstado((e) =>
      e.tipo === "conferir" && e.importacao.fatura.mes === mes
        ? { ...e, reimportar: aviso, erro: e.erro === "fatura.mes_ja_importado" ? null : e.erro }
        : e,
    );
  }

  /** "Tentar de novo" do aviso: relê só o resumo. */
  function atualizarAviso(mes: string) {
    setEstado((e) => (e.tipo === "conferir" ? { ...e, reimportar: { tipo: "lendo" } } : e));
    void buscarAviso(mes);
  }

  /** Solta as esperas pendentes (com o valor do limite): quem esperava vê a geração nova e para. */
  function soltarEsperas() {
    for (const soltar of [...esperas.current]) soltar();
  }

  /** `p`, ou `noLimite` se `p` falhar, passar de `LIMITE_CLASSIFICAR_MS` ou a espera for solta. */
  function comLimite<V>(p: Promise<V>, noLimite: V): Promise<V> {
    return new Promise((resolver) => {
      let feito = false;
      const terminar = (v: V) => {
        if (feito) return;
        feito = true;
        clearTimeout(relogio);
        esperas.current.delete(soltar);
        resolver(v);
      };
      const soltar = () => terminar(noLimite);
      const relogio = setTimeout(soltar, LIMITE_CLASSIFICAR_MS);
      esperas.current.add(soltar);
      p.then(terminar, soltar);
    });
  }

  /** Espera os Responsáveis e os Tipos saírem de "carregando": true se ficaram "pronto". */
  function esperarCadastros(): Promise<boolean> {
    if (cadastros.current.status !== "carregando") return Promise.resolve(cadastros.current.status === "pronto");
    let continuar = () => {};
    const saiu = new Promise<boolean>((resolver) => {
      continuar = () => resolver(cadastros.current.status === "pronto");
    });
    esperandoCadastros.current.push(continuar);
    return comLimite(saiu, false).finally(() => {
      esperandoCadastros.current = esperandoCadastros.current.filter((c) => c !== continuar);
    });
  }

  /** Marca o `ultimo_uso` das Regras usadas, sem esperar; a falha não chega à importação. */
  function marcarUsoDasRegras(chaves: readonly string[]) {
    if (chaves.length === 0) return;
    try {
      void Promise.resolve(repoRegras().marcarUso(chaves)).catch(() => {});
    } catch {
      // A Fatura já foi gravada.
    }
  }

  /** As Regras do dono; falhou → nenhuma (a importação não bloqueia). */
  async function lerRegras(): Promise<RegraGravada[]> {
    try {
      const r = await repoRegras().listar();
      return r.ok ? r.regras : [];
    } catch {
      return [];
    }
  }

  /** Abre o PDF (sem senha no passo 1) e segue para a leitura. */
  async function abrir(passo: 1 | 2, senhaUsada: string) {
    if (!arquivo) {
      setEstado({ tipo: "arquivo", erro: mensagem("fatura.sem_arquivo"), naoSantander: false });
      return;
    }
    const minha = ++geracao.current;
    setEstado({ tipo: "processando", passo, etapa: "abrindo" });
    let lido: Resultado<PdfLido>;
    try {
      // Um buffer novo a cada tentativa: o pdf.js consome o que recebe.
      lido = await lerPdf(new Uint8Array(await arquivo.arrayBuffer()), senhaUsada);
    } catch {
      lido = { ok: false, erro: { codigo: "fatura.pdf_invalido" } };
    }
    if (minha !== geracao.current) return;
    if (!lido.ok) {
      const codigo = lido.erro.codigo;
      if (codigo === "fatura.senha_vazia" || codigo === "fatura.senha_incorreta") {
        // No passo 1, pedir a senha não é erro: só vai para o passo 2.
        setEstado({ tipo: "senha", erro: passo === 1 ? null : mensagem(codigo) });
      } else {
        setEstado({ tipo: "arquivo", erro: mensagem(codigo), naoSantander: false });
      }
      return;
    }
    const texto = removerDadosPessoais(lido.valor.texto);
    if (!pareceFaturaSantander(texto)) {
      setEstado({ tipo: "arquivo", erro: null, naoSantander: true });
      return;
    }
    textoLimpo.current = texto;
    await lerTexto(texto, minha);
  }

  function tentarLerDeNovo() {
    const texto = textoLimpo.current;
    if (!texto) {
      reiniciar();
      return;
    }
    void lerTexto(texto, ++geracao.current);
  }

  async function gravar() {
    if (estado.tipo !== "conferir" || estado.gravando || gravandoAgora.current) return;
    gravandoAgora.current = true;
    const atual = estado;
    const mes = atual.importacao.fatura.mes;
    const substituir = atual.reimportar?.tipo === "pronto" ? atual.reimportar.substituir : undefined;
    setEstado({ ...atual, gravando: true, erro: null });
    const minha = geracao.current;
    const lidos = previstosLidosEm.current;
    const r = await repoFaturas().importar(
      atual.importacao,
      substituir,
      lidos && lidos.mes === mes ? lidos.atualizadoEm : undefined,
    );
    gravandoAgora.current = false;
    if (r.ok) {
      marcarUsoDasRegras(regrasUsadasNaImportacao.current);
      const resumo = resumoDaClassificacao(atual.importacao.lancamentos, atual.importacao.previstos_sem_par?.length ?? 0);
      if (substituir) toast.mostrar({ texto: rotuloReimportado(mes, r.quantidade) });
      aoImportar?.(mes);
      if (resumo.paraRevisar > 0 || resumo.naoVieram > 0 || resumo.casados > 0 || resumo.herdadas > 0 || resumo.divididas > 0) {
        // Há o que revisar ou previstos casados: o passo 3 mostra o resumo e os caminhos.
        setEstado({ tipo: "concluido", ...resumo });
        return;
      }
      reiniciar();
      aoMudar(false);
      return;
    }
    if (r.codigo === "fatura.mes_mudou") {
      // O Mês mudou depois da leitura: refaz o casamento com os previstos de agora (a trava e o plano ficam novos).
      const refeita = await refazerCasamento(mes);
      if (minha !== geracao.current) return;
      const importacao = refeita ?? atual.importacao;
      if (substituir) {
        // Os números do aviso ficaram velhos: só o erro, e "Tentar de novo" relê.
        setEstado({ ...atual, importacao, gravando: false, erro: null, reimportar: { tipo: "falhou", codigo: r.codigo } });
      } else {
        setEstado({ ...atual, importacao, gravando: false, erro: r.codigo });
      }
      return;
    }
    if (r.codigo === "fatura.mes_ja_importado") {
      // Outro aparelho importou antes: o efeito abaixo lê o aviso.
      setEstado({ ...atual, gravando: false, erro: r.codigo, reimportar: null });
      return;
    }
    setEstado({ ...atual, gravando: false, erro: r.codigo });
  }

  // O Mês ganhou Fatura depois de classificar (Realtime ou recusa da RPC): lê
  // o aviso; enquanto lê, o passo 3 mostra "Carregando…".
  const mesSemAviso =
    estado.tipo === "conferir" &&
    !estado.gravando &&
    estado.reimportar === null &&
    (estado.erro === "fatura.mes_ja_importado" || faturas.some((f) => f.mes === estado.importacao.fatura.mes))
      ? estado.importacao.fatura.mes
      : null;
  useEffect(() => {
    if (mesSemAviso !== null) void buscarAviso(mesSemAviso);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o Mês passa a precisar do aviso
  }, [mesSemAviso]);

  const passo = passoDo(estado);
  const ocupado = estado.tipo === "processando";

  const cancelar = (
    <Botao onClick={fechar} disabled={gravando}>
      {ROTULOS.cancelar}
    </Botao>
  );

  let corpo: ReactNode = null;
  let acoes: ReactNode = cancelar;

  if (estado.tipo === "arquivo" && estado.naoSantander) {
    corpo = (
      <p role="alert" className="rounded-lg border border-alert-warning-border bg-alert-warning-bg p-3 texto-body">
        {mensagem("fatura.nao_santander")}
      </p>
    );
    acoes = (
      <>
        {cancelar}
        <Botao variante="primario" onClick={reiniciar}>
          {T.escolher_outro_pdf}
        </Botao>
      </>
    );
  } else if (estado.tipo === "arquivo") {
    corpo = (
      <Campo
        rotulo={T.arquivo}
        type="file"
        accept="application/pdf,.pdf"
        erro={estado.erro}
        className="py-2"
        onChange={(e) => {
          // Cancelar o seletor não descarta o PDF já escolhido.
          const escolhido = e.target.files?.[0];
          if (!escolhido) return;
          setArquivo(escolhido);
          setSenha("");
          setEstado(INICIAL);
        }}
      />
    );
    acoes = (
      <>
        {cancelar}
        <Botao variante="primario" disabled={!arquivo} onClick={() => void abrir(1, "")}>
          {T.continuar}
        </Botao>
      </>
    );
  } else if (estado.tipo === "senha") {
    corpo = (
      <form
        id="form-senha-fatura"
        onSubmit={(e) => {
          e.preventDefault();
          if (!senha) {
            setEstado({ tipo: "senha", erro: mensagem("fatura.senha_vazia") });
            return;
          }
          void abrir(2, senha);
        }}
      >
        <Campo
          rotulo={T.senha}
          type="password"
          autoComplete="off"
          autoFocus
          value={senha}
          erro={estado.erro}
          onChange={(e) => {
            setSenha(e.target.value);
            if (estado.erro) setEstado({ tipo: "senha", erro: null });
          }}
        />
      </form>
    );
    acoes = (
      <>
        {cancelar}
        <Botao type="submit" form="form-senha-fatura" variante="primario">
          {T.continuar}
        </Botao>
      </>
    );
  } else if (estado.tipo === "processando") {
    const indice = ORDEM_ETAPAS.indexOf(estado.etapa);
    corpo = (
      <div className="flex flex-col gap-2">
        <div
          role="progressbar"
          aria-label={T.progresso}
          aria-valuemin={0}
          aria-valuemax={ORDEM_ETAPAS.length}
          aria-valuenow={indice + 1}
          aria-valuetext={ETAPAS_IMPORTACAO[estado.etapa]}
          className="h-1 w-full overflow-hidden rounded-full bg-border"
        >
          <div
            className="h-full bg-accent-line motion-safe:transition-[width]"
            style={{ width: `${((indice + 1) / ORDEM_ETAPAS.length) * 100}%` }}
          />
        </div>
        <p role="status" className="texto-body text-text-muted">
          {ETAPAS_IMPORTACAO[estado.etapa]}
        </p>
      </div>
    );
  } else if (estado.tipo === "falha_leitura") {
    corpo = (
      <p role="alert" className="texto-body text-danger-fg">
        {mensagem(estado.codigo)}
      </p>
    );
    acoes =
      estado.codigo === "auth.sessao_expirou" ? (
        cancelar
      ) : (
        <>
          {cancelar}
          <Botao variante="primario" onClick={tentarLerDeNovo}>
            {ROTULOS.tentar_de_novo}
          </Botao>
        </>
      );
  } else if (estado.tipo === "concluido") {
    corpo = (
      <div role="status" className="flex flex-col gap-1">
        <p className="texto-body-strong">{rotuloResumoClassificacao(estado.classificados, estado.paraRevisar)}</p>
        {estado.casados > 0 ? <p className="texto-body">{rotuloPrevistosCasados(estado.casados)}</p> : null}
        {estado.herdadas > 0 ? <p className="texto-body">{rotuloParcelasHerdadas(estado.herdadas)}</p> : null}
        {estado.divididas > 0 ? <p className="texto-body">{rotuloDivididosPelaRegra(estado.divididas)}</p> : null}
        {estado.naoVieram > 0 ? <p className="texto-body">{rotuloPrevistosNaoVieram(estado.naoVieram)}</p> : null}
      </div>
    );
    const temRevisao = estado.paraRevisar > 0 || estado.naoVieram > 0;
    acoes = temRevisao ? (
      <>
        <Botao onClick={fechar}>{TEXTOS_REVISAR.ver_no_painel}</Botao>
        <Botao
          variante="primario"
          onClick={() => {
            fechar();
            aoIrParaRevisao?.();
          }}
        >
          {TEXTOS_REVISAR.ir_para_revisao}
        </Botao>
      </>
    ) : (
      <Botao variante="primario" onClick={fechar}>
        {TEXTOS_REVISAR.ver_no_painel}
      </Botao>
    );
  } else {
    const { importacao, conferencia, erro, reimportar } = estado;
    const aviso: AvisoReimportar | null =
      mesSemAviso !== null
        ? { tipo: "lendo" }
        : reimportar?.tipo === "pronto" || reimportar?.tipo === "lendo" || reimportar?.tipo === "falhou"
          ? reimportar
          : null;
    const f = importacao.fatura;
    const casados = importacao.lancamentos.filter((l) => (l.previsto_id ?? null) !== null).length;
    const herdadas = importacao.lancamentos.filter((l) => (l.herdado_de_id ?? null) !== null && l.ajuste_de_ordem === null).length;
    // Linhas novas que entram divididas (pela Regra ou pela parcela anterior, História 3.8).
    const divididas = importacao.lancamentos.filter((l) => (l.divisao ?? null) !== null && (l.previsto_id ?? null) === null).length;
    const naoVieram = importacao.previstos_sem_par?.length ?? 0;
    // Fatura com linhas casadas não reimporta (a RPC recusa): só "Cancelar".
    const bloqueadaPorCasados = aviso?.tipo === "pronto" && (aviso.resumo.casados ?? 0) > 0;
    corpo = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-background p-3">
          <p className="texto-label text-text-muted">{T.lido_no_pdf}</p>
          <p className="texto-body-strong">{tituloFaturaLida(f.mes, f.vencimento)}</p>
          <TotalAPagar fatura={f} valoresCentavos={importacao.lancamentos.map((l) => l.valor_centavos)} />
          <p className="texto-number text-text-muted">
            {rotuloDespesasCreditos(f.total_despesas_centavos, f.total_creditos_centavos)}
          </p>
        </div>
        <p className={conferencia.conferido ? "texto-body-strong text-accent" : "texto-body-strong"}>
          {rotuloConferencia(conferencia)}
        </p>
        {conferencia.conferido ? null : (
          <p className="texto-number text-text-muted">
            {rotuloDespesasCreditos(conferencia.despesasCentavos, conferencia.creditosCentavos)}
          </p>
        )}
        <p className="texto-body">{rotuloSeraoGravados(importacao.lancamentos.length)}</p>
        {casados > 0 ? <p className="texto-body">{rotuloPrevistosCasados(casados)}</p> : null}
        {herdadas > 0 ? <p className="texto-body">{rotuloParcelasHerdadas(herdadas)}</p> : null}
        {divididas > 0 ? <p className="texto-body">{rotuloDivididosPelaRegra(divididas)}</p> : null}
        {naoVieram > 0 ? <p className="texto-body text-text-muted">{rotuloPrevistosNaoVieram(naoVieram)}</p> : null}
        {importacao.previstos.length > 0 ? (
          <p className="texto-body text-text-muted">{rotuloPrevistosCriados(importacao.previstos.length)}</p>
        ) : null}
        {aviso?.tipo === "pronto" ? (
          <p role="alert" className="rounded-lg border border-alert-warning-border bg-alert-warning-bg p-3 texto-body">
            {bloqueadaPorCasados
              ? avisoReimportarBloqueado(f.mes, aviso.resumo.casados ?? 0)
              : avisoReimportar(f.mes, aviso.resumo)}
          </p>
        ) : aviso?.tipo === "lendo" ? (
          <p role="status" className="texto-body text-text-muted">
            {T.carregando}
          </p>
        ) : aviso?.tipo === "falhou" ? (
          <p role="alert" className="texto-body text-danger-fg">
            {mensagem(aviso.codigo)}
          </p>
        ) : null}
        {aviso?.tipo === "pronto" && conferencia.incompleta ? (
          <p role="alert" className="rounded-lg border border-alert-warning-border bg-alert-warning-bg p-3 texto-body">
            {textoExtracaoIncompleta(conferencia.quantidade)}
          </p>
        ) : null}
        {/* Sem aviso (Mês sem Fatura, ou o banco disse que não tem): passo 3 normal. */}
        {aviso ? null : conferencia.incompleta ? (
          <p role="alert" className="rounded-lg border border-alert-warning-border bg-alert-warning-bg p-3 texto-body">
            {textoExtracaoIncompleta(conferencia.quantidade)}
          </p>
        ) : null}
        {erro ? (
          <p role="alert" className="texto-body text-danger-fg">
            {mensagem(erro)}
          </p>
        ) : null}
      </div>
    );
    const rotuloGravar = estado.gravando
      ? T.gravando
      : erro
        ? ROTULOS.tentar_de_novo
        : conferencia.incompleta
          ? T.importar_mesmo_assim
          : T.importar;
    const sessaoExpirou = erro === "auth.sessao_expirou" || (aviso?.tipo === "falhou" && aviso.codigo === "auth.sessao_expirou");
    // Repetir não resolve: os previstos mudaram (importar a fatura de novo) ou a Fatura tem linhas casadas.
    const semCasamento = erro === "fatura.previstos_sem_casamento" || erro === "fatura.reimportacao_com_casados";
    acoes = sessaoExpirou || semCasamento || bloqueadaPorCasados || aviso?.tipo === "lendo" ? (
      cancelar
    ) : aviso?.tipo === "falhou" ? (
      <>
        {cancelar}
        <Botao variante="primario" onClick={() => atualizarAviso(f.mes)}>
          {ROTULOS.tentar_de_novo}
        </Botao>
      </>
    ) : aviso?.tipo === "pronto" ? (
      <>
        {cancelar}
        <Botao variante="destrutivo" disabled={estado.gravando} onClick={() => void gravar()}>
          {estado.gravando ? T.gravando : T.importar_de_novo}
        </Botao>
      </>
    ) : (
      <>
        {cancelar}
        <Botao variante="primario" disabled={estado.gravando} onClick={() => void gravar()}>
          {rotuloGravar}
        </Botao>
      </>
    );
  }

  return (
    <Janela
      aberta={aberta}
      aoMudar={(nova) => {
        if (nova) aoMudar(true);
        else fechar();
      }}
      titulo={T.titulo}
      descricao={rotuloPassoImportar(passo)}
      rodape={ocupado ? cancelar : acoes}
    >
      {corpo}
    </Janela>
  );
}
