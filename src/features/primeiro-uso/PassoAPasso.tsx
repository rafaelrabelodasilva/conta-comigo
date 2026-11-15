"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ROTULOS, TEXTOS_PASSO, mensagem, rotuloPasso, rotuloProximosPassos } from "@/domain/mensagens";
import {
  PASSOS_PRIMEIRO_USO,
  numeroDoPasso,
  passoAnterior,
  passosSeguintes,
  proximoPasso,
  type PassoPrimeiroUso,
} from "@/domain/primeiro-uso";
import { repoConfiguracoes } from "@/data/configuracoes-repo";
import type { PropsSecao } from "@/features/configuracoes/rascunho";
import { SecaoCiclo } from "@/features/configuracoes/SecaoCiclo";
import { SecaoImportarPlanilha } from "@/features/configuracoes/SecaoImportarPlanilha";
import { SecaoModeloMensagem } from "@/features/configuracoes/SecaoModeloMensagem";
import { SecaoResponsaveis } from "@/features/configuracoes/SecaoResponsaveis";
import { SecaoStatus } from "@/features/configuracoes/SecaoStatus";
import { SecaoTipos } from "@/features/configuracoes/SecaoTipos";
import { Botao } from "@/ui/Botao";
import { Janela } from "@/ui/Janela";
import { useToast } from "@/ui/Toast";
import { SecaoBlocos } from "./SecaoBlocos";

// Passo a passo do Primeiro uso (mockup `primeiro-uso.html`): cada passo
// mostra a seção de Configurações como ela é, com "Pular" e "Continuar".
// Os dois só avançam: o que grava é a própria seção. No último passo,
// "Continuar" vira "Concluir"; Concluir ou Pular ali grava a marca
// `primeiro_uso_em` e vai para o Painel. Se a gravação falhar, toast e
// continua no passo. "Voltar" (a partir do passo 2) volta um passo sem
// gravar. Se a seção avisar que há algo digitado e não salvo, Voltar, Pular,
// Continuar e Concluir perguntam antes ("Voltar para salvar" ou "Descartar",
// que faz a ação pedida).

// Uma seção por passo (faltar uma é erro de tipo).
const SECAO_DO_PASSO: Record<PassoPrimeiroUso, (props: PropsSecao) => React.JSX.Element> = {
  responsaveis: SecaoResponsaveis,
  tipos: SecaoTipos,
  status: SecaoStatus,
  planilha: SecaoImportarPlanilha,
  blocos: SecaoBlocos,
  mensagem: SecaoModeloMensagem,
  ciclo: SecaoCiclo,
};

export function PassoAPasso({ passoInicial }: { passoInicial: PassoPrimeiroUso }) {
  const router = useRouter();
  const toast = useToast();
  const [passo, setPasso] = useState(passoInicial);
  const [concluindo, setConcluindo] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  const primeiraPintura = useRef(true);
  // A seção do passo avisa o rascunho; a ref é lida no clique (sem esperar render).
  const temRascunho = useRef(false);
  // A ação que espera a resposta da janela de rascunho (`null` = fechada).
  const [pendente, setPendente] = useState<"avancar" | "voltar" | null>(null);
  const aoMudarRascunho = useCallback((tem: boolean) => {
    temRascunho.current = tem;
  }, []);

  // A cada passo novo, o foco vai para a pergunta (VoiceOver lê o passo novo).
  useEffect(() => {
    if (primeiraPintura.current) {
      primeiraPintura.current = false;
      return;
    }
    titulo.current?.focus();
  }, [passo]);

  const textos = TEXTOS_PASSO[passo];
  const seguintes = passosSeguintes(passo);
  const proximo = proximoPasso(passo);
  const anterior = passoAnterior(passo);
  const Secao = SECAO_DO_PASSO[passo];

  /** Voltar, Pular, Continuar e Concluir: com rascunho, pergunta antes. */
  function pedir(acao: "avancar" | "voltar") {
    if (temRascunho.current) {
      setPendente(acao);
      return;
    }
    executar(acao);
  }

  function descartar() {
    const acao = pendente;
    setPendente(null);
    temRascunho.current = false;
    if (acao) executar(acao);
  }

  function executar(acao: "avancar" | "voltar") {
    if (acao === "voltar") {
      if (anterior) irPara(anterior);
      return;
    }
    void avancar();
  }

  function irPara(novo: PassoPrimeiroUso) {
    setPasso(novo);
    // Mantém `?passo=` em dia sem recarregar (integra com o roteador do Next).
    window.history.replaceState(null, "", `?passo=${novo}`);
  }

  async function avancar() {
    if (proximo) {
      irPara(proximo);
      return;
    }
    setConcluindo(true);
    const r = await repoConfiguracoes().concluirPrimeiroUso();
    if (!r.ok) {
      setConcluindo(false);
      toast.mostrar({ texto: mensagem(r.codigo) });
      return;
    }
    router.replace("/");
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-6">
      <header className="flex flex-col gap-1">
        <p className="texto-eyebrow text-text-muted">
          {rotuloPasso(numeroDoPasso(passo), PASSOS_PRIMEIRO_USO.length, textos.secao)}
        </p>
        <h1 ref={titulo} tabIndex={-1} className="texto-title">
          {textos.pergunta}
        </h1>
        <p className="texto-body text-text-muted">{textos.ajuda}</p>
      </header>
      <Secao aoMudarRascunho={aoMudarRascunho} />
      {seguintes.length > 0 ? (
        <p className="texto-label font-normal text-text-muted">
          {rotuloProximosPassos(seguintes.map((p) => TEXTOS_PASSO[p].secao))}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        {anterior ? (
          <Botao variante="secundario" disabled={concluindo} onClick={() => pedir("voltar")}>
            {ROTULOS.voltar}
          </Botao>
        ) : null}
        <Botao variante="secundario" disabled={concluindo} onClick={() => pedir("avancar")}>
          {ROTULOS.pular}
        </Botao>
        <span className="flex-1" />
        <Botao variante="primario" disabled={concluindo} onClick={() => pedir("avancar")}>
          {proximo ? ROTULOS.continuar : ROTULOS.concluir}
        </Botao>
      </div>
      <Janela
        aberta={pendente !== null}
        aoMudar={(aberta) => {
          if (!aberta) setPendente(null);
        }}
        titulo={mensagem("rascunho.nao_salvo")}
        rodape={
          <>
            <Botao variante="secundario" onClick={descartar}>
              {ROTULOS.descartar}
            </Botao>
            <Botao variante="primario" onClick={() => setPendente(null)}>
              {ROTULOS.voltar_para_salvar}
            </Botao>
          </>
        }
      />
    </div>
  );
}
