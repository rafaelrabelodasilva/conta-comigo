"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { hojeEmSaoPaulo } from "@/domain/datas";
import { ROTULOS, TEXTOS_MODELO, mensagem, rotuloPrevia } from "@/domain/mensagens";
import {
  CAMPOS_DA_LINHA,
  fraseSemMarcador,
  lerModelo,
  modelosIguais,
  previaDoModelo,
  validarModelo,
  type CampoDaLinha,
  type CampoDeTexto,
  type CampoDoModelo,
  type ModeloMensagem,
} from "@/domain/modelo-mensagem";
import { mesAtual } from "@/domain/painel";
import { configuracoesDoDono, repoConfiguracoes } from "@/data/configuracoes-repo";
import { gerenciador, useLinhas } from "@/data/realtime";
import { AreaTexto } from "@/ui/AreaTexto";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { useToast } from "@/ui/Toast";
import { useAvisarRascunho, type PropsSecao } from "./rascunho";

// Configurações → Modelo da mensagem (História 4.5, FR-23, UX-DR25): saudação,
// frase do total ({total}), chave Pix, rodapé e as caixas da linha de detalhe,
// com a prévia ao vivo ao lado. Lê só pelo gerenciador de Realtime e grava só
// pelo repositório. Toda regra (validação, normalização, marcador, prévia)
// vem de `src/domain/modelo-mensagem.ts`.
//
// Salvar: o mesmo das outras seções, com rascunho e o botão "Salvar" (ou Enter
// nos campos de uma linha); nada grava a cada tecla. A prévia, sim, muda a cada
// tecla e não é anunciada pelo leitor de tela (`aria-live` fora): é uma região
// nomeada e focável, que se lê sob demanda.
//
// Outro aparelho: se o modelo salvo mudar enquanto há rascunho, o rascunho
// fica como está, um aviso diz o que houve e "Usar o modelo salvo" o descarta.
// Salvar vale o rascunho (a última gravação vence, como no resto do app).

type Rascunho = {
  /** O modelo salvo de quando o rascunho começou: serve para saber se outro aparelho mexeu. */
  base: ModeloMensagem;
  valor: ModeloMensagem;
};

const ROTULO_CAMPO_DA_LINHA: Record<CampoDaLinha, string> = {
  nome: TEXTOS_MODELO.campo_nome,
  parcela: TEXTOS_MODELO.campo_parcela,
  valor: TEXTOS_MODELO.campo_valor,
};

export function SecaoModeloMensagem({ aoMudarRascunho }: PropsSecao = {}) {
  const configuracoes = useLinhas("configuracoes");
  const lancamentos = useLinhas("lancamentos");
  const status = useLinhas("status");
  const toast = useToast();
  const idAjudaFrase = useId();
  const idAjudaPix = useId();
  const idAvisoFrase = useId();
  const idErroCampos = useId();
  const idTituloPrevia = useId();
  // O Mês atual em São Paulo, um só por montagem (a prévia usa os dados dele).
  const [mes] = useState(() => mesAtual(hojeEmSaoPaulo(new Date())));
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erros, setErros] = useState<Partial<Record<CampoDoModelo, string>>>({});
  const [salvando, setSalvando] = useState(false);

  // A memória de `lancamentos` guarda só um Mês (AD-4): abre o atual para a prévia.
  useEffect(() => {
    gerenciador("lancamentos").abrirMes(mes);
  }, [mes]);

  const linha = configuracoesDoDono(configuracoes.linhas);
  const salvo = useMemo(() => lerModelo(linha?.modelo_mensagem), [linha?.modelo_mensagem]);
  const valor = rascunho?.valor ?? salvo;
  const temRascunho = rascunho !== null && !modelosIguais(rascunho.valor, salvo);
  const mudouEmOutroAparelho = temRascunho && !modelosIguais(rascunho.base, salvo);
  // Só no Primeiro uso: avisa se há algo digitado e não salvo.
  useAvisarRascunho(temRascunho, aoMudarRascunho);

  // Prévia: o Mês atual quando carregou; erro ou Mês vazio → itens de exemplo.
  const previaCarregando =
    lancamentos.status !== "erro" &&
    status.status !== "erro" &&
    (lancamentos.mes !== mes || lancamentos.status !== "pronto" || status.status !== "pronto");
  const previa = useMemo(() => {
    const doMes = lancamentos.mes === mes && lancamentos.status === "pronto" ? lancamentos.linhas : [];
    const pagos = new Set(status.linhas.filter((s) => s.conta_como_pago).map((s) => s.id));
    return previaDoModelo(valor, doMes, mes, pagos);
  }, [valor, lancamentos.mes, lancamentos.status, lancamentos.linhas, status.linhas, mes]);

  function mudar(novo: ModeloMensagem, campo: CampoDoModelo) {
    setRascunho({ base: rascunho?.base ?? salvo, valor: novo });
    setErros((e) => ({ ...e, [campo]: undefined }));
  }

  function mudarTexto(campo: CampoDeTexto, texto: string) {
    mudar({ ...valor, [campo]: texto }, campo);
  }

  function mudarCaixa(campo: CampoDaLinha, marcada: boolean) {
    mudar({ ...valor, campos: { ...valor.campos, [campo]: marcada } }, "campos");
  }

  async function salvar() {
    const validado = validarModelo(valor);
    if (!validado.ok) {
      const comTexto: Partial<Record<CampoDoModelo, string>> = {};
      for (const [campo, codigo] of Object.entries(validado.erros)) comTexto[campo as CampoDoModelo] = mensagem(codigo);
      setErros(comTexto);
      return;
    }
    setSalvando(true);
    const r = await repoConfiguracoes().definirModeloMensagem(validado.valor);
    setSalvando(false);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return;
    }
    setRascunho(null);
    setErros({});
    toast.mostrar({ texto: TEXTOS_MODELO.salvo });
  }

  let conteudo: ReactNode;
  if (configuracoes.status === "erro") {
    conteudo = <ErroAoCarregar aoTentarDeNovo={() => void gerenciador("configuracoes").recarregar()} />;
  } else if (configuracoes.status !== "pronto") {
    conteudo = (
      <div className="flex flex-col gap-2 p-2" aria-busy>
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-toque" />
        ))}
      </div>
    );
  } else {
    conteudo = (
      <div className="flex flex-wrap items-start gap-4 px-2 pb-2">
        <form
          className="flex min-w-72 flex-1 flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
        >
          {mudouEmOutroAparelho ? (
            <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-background p-3">
              <p role="status" className="flex-1 texto-label font-normal text-text">
                {TEXTOS_MODELO.mudou_em_outro_aparelho}
              </p>
              <Botao type="button" variante="secundario" disabled={salvando} onClick={() => setRascunho(null)}>
                {TEXTOS_MODELO.usar_modelo_salvo}
              </Botao>
            </div>
          ) : null}
          <Campo
            rotulo={TEXTOS_MODELO.saudacao}
            value={valor.saudacao}
            disabled={salvando}
            erro={erros.saudacao}
            onChange={(e) => mudarTexto("saudacao", e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <Campo
              rotulo={TEXTOS_MODELO.frase_total}
              value={valor.frase_total}
              disabled={salvando}
              erro={erros.frase_total}
              aria-describedby={[idAjudaFrase, fraseSemMarcador(valor) ? idAvisoFrase : null].filter(Boolean).join(" ")}
              onChange={(e) => mudarTexto("frase_total", e.target.value)}
            />
            <p id={idAjudaFrase} className="texto-label font-normal text-text-muted">
              {TEXTOS_MODELO.ajuda_frase}
            </p>
            {fraseSemMarcador(valor) && !erros.frase_total ? (
              <p id={idAvisoFrase} className="texto-label font-normal text-text">
                {TEXTOS_MODELO.sem_marcador}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Campo
              rotulo={TEXTOS_MODELO.chave_pix}
              value={valor.chave_pix}
              disabled={salvando}
              erro={erros.chave_pix}
              aria-describedby={idAjudaPix}
              onChange={(e) => mudarTexto("chave_pix", e.target.value)}
            />
            <p id={idAjudaPix} className="texto-label font-normal text-text-muted">
              {TEXTOS_MODELO.ajuda_pix}
            </p>
          </div>
          <fieldset
            className="flex flex-col"
            aria-describedby={erros.campos ? idErroCampos : undefined}
            aria-invalid={erros.campos ? true : undefined}
          >
            <legend className="texto-label text-text">{TEXTOS_MODELO.campos_da_linha}</legend>
            {CAMPOS_DA_LINHA.map((campo) => (
              // A linha toda é a caixa: 44 pt de altura e toque em qualquer ponto dela.
              <label key={campo} className="flex min-h-toque cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={valor.campos[campo]}
                  disabled={salvando}
                  onChange={(e) => mudarCaixa(campo, e.target.checked)}
                  className="size-4.5 shrink-0 cursor-pointer accent-accent"
                />
                <span className="texto-body text-text">{ROTULO_CAMPO_DA_LINHA[campo]}</span>
              </label>
            ))}
            {erros.campos ? (
              <p id={idErroCampos} className="texto-label font-normal text-danger-fg">
                {erros.campos}
              </p>
            ) : null}
          </fieldset>
          <AreaTexto
            rotulo={TEXTOS_MODELO.rodape}
            rows={3}
            value={valor.rodape}
            disabled={salvando}
            erro={erros.rodape}
            onChange={(e) => mudarTexto("rodape", e.target.value)}
          />
          <div>
            <Botao type="submit" variante="primario" disabled={salvando}>
              {ROTULOS.salvar}
            </Botao>
          </div>
        </form>
        <div className="flex min-w-72 flex-1 flex-col gap-2">
          <h3 id={idTituloPrevia} className="texto-label text-text">
            {TEXTOS_MODELO.previa}
          </h3>
          {previaCarregando ? (
            <Esqueleto className="h-40" />
          ) : (
            <>
              <p className="texto-label font-normal text-text-muted">
                {rotuloPrevia(previa.origem, previa.quantidade, previa.mes)}
              </p>
              {/* Sem aria-live: a cada tecla o texto muda, e o leitor de tela leria tudo de novo. */}
              <div
                role="region"
                aria-labelledby={idTituloPrevia}
                tabIndex={0}
                className="min-h-24 rounded-sm border border-border bg-background p-3"
              >
                {previa.texto === "" ? (
                  <p className="texto-body text-text-muted">{TEXTOS_MODELO.previa_vazia}</p>
                ) : (
                  <pre className="texto-message whitespace-pre-wrap break-words text-text">{previa.texto}</pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="titulo-modelo-mensagem"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
    >
      <header className="flex flex-col gap-1">
        <h2 id="titulo-modelo-mensagem" className="texto-body-strong">
          {ROTULOS.modelo_mensagem}
        </h2>
        <p className="texto-label font-normal text-text-muted">{TEXTOS_MODELO.descricao}</p>
      </header>
      {conteudo}
    </section>
  );
}
