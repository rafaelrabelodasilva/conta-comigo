"use client";

import { useId, useMemo, useRef, useState } from "react";
import { TEXTOS_GERAR as T, ROTULOS } from "@/domain/mensagens";
import { gerarMensagem, type ModeloMensagem } from "@/domain/modelo-mensagem";
import {
  avisoDosItensDeFora,
  podeIncluirPrevistos,
  projetarMensagem,
  type LancamentoParaMensagem,
} from "@/domain/projecoes";
import { Botao } from "@/ui/Botao";
import { Interruptor } from "@/ui/Interruptor";
import { Janela } from "@/ui/Janela";
import { useToast } from "@/ui/Toast";

// Janela "Gerar mensagem" da barra de Seleção (História 4.6, FR-24, UX-DR17): o
// texto da forma 1 no quadro `message`, o aviso do que ficou de fora, "Copiar",
// "Editar modelo" e "Fechar", e "Incluir previstos" só num Mês sem Fatura. Toda
// regra (quem entra, o texto, o aviso) vem do núcleo: `projetarMensagem`,
// `gerarMensagem` e `avisoDosItensDeFora`; aqui só há estado de tela e a área de
// transferência.
//
// A mensagem acompanha os dados: se outro aparelho muda um Lançamento ou o modelo
// com a janela aberta, o texto se refaz e um aviso (`role="status"`) diz que mudou,
// em vez de deixar Rafael copiar um texto velho sem saber. Ligar ou desligar
// "Incluir previstos" é escolha dele e não dispara o aviso. A Seleção não muda por
// baixo da janela (ela é modal); se esvaziar (excluída em outro aparelho), o
// Painel a fecha.
//
// Acessibilidade: o foco abre no quadro (o leitor de tela lê a mensagem) ou, sem
// mensagem, em "Editar modelo". O quadro é uma área de texto só de leitura:
// focável, selecionável pelo teclado (⌘/Ctrl+A, ⌘/Ctrl+C) e lida como texto. O
// aviso dos itens de fora é a descrição da janela (lida ao abrir); a falha de
// cópia é `role="alert"`; o "Copiado" é o toast.

export type PropsJanelaGerarMensagem = {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  /** Os ids marcados (as unidades da grade). */
  selecao: ReadonlySet<string>;
  /** Os Lançamentos da memória (o núcleo separa o Mês). */
  lancamentos: readonly LancamentoParaMensagem[];
  mes: string;
  temFatura: boolean;
  /** Os Status que contam como pago. */
  statusPagos: ReadonlySet<string>;
  modelo: ModeloMensagem;
  /** Leva a Configurações → Modelo da mensagem. */
  aoEditarModelo: () => void;
};

export function JanelaGerarMensagem({
  aberta,
  aoMudar,
  selecao,
  lancamentos,
  mes,
  temFatura,
  statusPagos,
  modelo,
  aoEditarModelo,
}: PropsJanelaGerarMensagem) {
  const toast = useToast();
  const idQuadro = useId();
  const quadro = useRef<HTMLTextAreaElement>(null);
  const editar = useRef<HTMLButtonElement>(null);
  const [incluirPrevistos, setIncluirPrevistos] = useState(false);
  const [falhouAoCopiar, setFalhouAoCopiar] = useState(false);

  const projecao = useMemo(
    () => projetarMensagem(selecao, lancamentos, { mes, statusPagos, temFatura, incluirPrevistos }),
    [selecao, lancamentos, mes, statusPagos, temFatura, incluirPrevistos],
  );
  const gerada = useMemo(() => gerarMensagem(modelo, projecao), [modelo, projecao]);
  const texto = gerada.estado === "pronta" ? gerada.texto : "";
  const aviso = avisoDosItensDeFora(projecao.fora);

  // O que Rafael viu ao abrir (ou ao mexer em "Incluir previstos"): se muda sem ele
  // mexer, é outro aparelho. Ajuste durante a renderização, com guarda.
  const instantaneo = `${gerada.estado}\n${texto}`;
  const [visto, setVisto] = useState({ incluir: incluirPrevistos, instantaneo });
  if (visto.incluir !== incluirPrevistos) setVisto({ incluir: incluirPrevistos, instantaneo });
  const mudou = visto.incluir === incluirPrevistos && visto.instantaneo !== instantaneo;

  async function copiar() {
    if (texto === "") return;
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Sem permissão ou sem a API (contexto sem HTTPS): o texto fica à mão para copiar na mão.
      setFalhouAoCopiar(true);
      quadro.current?.focus();
      quadro.current?.select();
      return;
    }
    aoMudar(false);
    toast.mostrar({ texto: T.copiado });
  }

  const semModelo = gerada.estado === "modelo_vazio" || gerada.estado === "modelo_sem_campos";

  return (
    <Janela
      aberta={aberta}
      aoMudar={aoMudar}
      titulo={T.titulo}
      descricao={aviso === "" ? T.ajuda : aviso}
      aoAbrirFoco={(e) => {
        e.preventDefault();
        (quadro.current ?? editar.current)?.focus();
      }}
      rodape={
        <>
          <Botao onClick={() => aoMudar(false)}>{ROTULOS.fechar}</Botao>
          <Botao ref={editar} variante={semModelo ? "primario" : "secundario"} onClick={aoEditarModelo}>
            {T.editar_modelo}
          </Botao>
          <Botao variante="primario" disabled={gerada.estado !== "pronta"} onClick={() => void copiar()}>
            {T.copiar}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {podeIncluirPrevistos(temFatura) ? (
          <Interruptor rotulo={T.incluir_previstos} ligado={incluirPrevistos} aoMudar={setIncluirPrevistos} />
        ) : null}
        <p role="status" className="texto-label text-text">
          {mudou ? T.mudou : ""}
        </p>
        {gerada.estado === "pronta" ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={idQuadro} className="texto-label text-text">
              {T.quadro}
            </label>
            <textarea
              id={idQuadro}
              ref={quadro}
              readOnly
              value={texto}
              rows={Math.min(16, Math.max(5, texto.split("\n").length + 1))}
              className="w-full resize-none rounded-sm border border-border bg-background p-3 texto-message text-text"
            />
          </div>
        ) : (
          <p className="rounded-sm border border-border bg-background p-3 texto-body text-text-muted">
            {gerada.estado === "nada_a_cobrar"
              ? T.nada_a_cobrar
              : gerada.estado === "modelo_vazio"
                ? T.modelo_vazio
                : T.modelo_sem_campos}
          </p>
        )}
        {falhouAoCopiar ? (
          <p role="alert" className="texto-label font-normal text-danger-fg">
            {T.falha_ao_copiar}
          </p>
        ) : null}
      </div>
    </Janela>
  );
}
