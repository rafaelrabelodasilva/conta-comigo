"use client";

import { useState, type ReactNode } from "react";
import {
  LIMITE_AJUSTE_PADRAO_CENTAVOS,
  TOLERANCIA_ATRASO_PADRAO_DIAS,
  validarLimiteAjuste,
  validarToleranciaAtraso,
} from "@/domain/configuracoes";
import { formatarDinheiro } from "@/domain/dinheiro";
import { ROTULOS, mensagem } from "@/domain/mensagens";
import { configuracoesDoDono, repoConfiguracoes } from "@/data/configuracoes-repo";
import { gerenciador, useLinhas } from "@/data/realtime";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { useToast } from "@/ui/Toast";

// Configurações → Conferência e atraso: limite do Ajuste (em reais) e
// tolerância de atraso (em dias). Só gravam; os Épicos 2 e 6 vão usá-los.
// Lê só pelo gerenciador de Realtime e grava só pelo repositório, que manda
// só as colunas alteradas.

type Rascunho = { limite: string; tolerancia: string };

export function SecaoConferencia() {
  const { status, linhas } = useLinhas("configuracoes");
  const toast = useToast();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erros, setErros] = useState<{ limite?: string; tolerancia?: string }>({});
  const [salvando, setSalvando] = useState(false);

  const atual = configuracoesDoDono(linhas);
  const valores: Rascunho = rascunho ?? {
    limite: formatarDinheiro(atual?.limite_ajuste_centavos ?? LIMITE_AJUSTE_PADRAO_CENTAVOS),
    tolerancia: String(atual?.tolerancia_atraso_dias ?? TOLERANCIA_ATRASO_PADRAO_DIAS),
  };

  function mudar(campo: keyof Rascunho, valor: string) {
    setRascunho({ ...valores, [campo]: valor });
    setErros((e) => ({ ...e, [campo]: undefined }));
  }

  async function salvar() {
    const limite = validarLimiteAjuste(valores.limite);
    const tolerancia = validarToleranciaAtraso(valores.tolerancia);
    if (!limite.ok || !tolerancia.ok) {
      setErros({
        limite: limite.ok ? undefined : mensagem(limite.erro.codigo),
        tolerancia: tolerancia.ok ? undefined : mensagem(tolerancia.erro.codigo),
      });
      return;
    }
    setSalvando(true);
    // Uma só gravação: ou as duas colunas mudam, ou nenhuma.
    const r = await repoConfiguracoes().definirConferencia({
      limite_ajuste_centavos: limite.valor,
      tolerancia_atraso_dias: tolerancia.valor,
    });
    setSalvando(false);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return;
    }
    setRascunho(null);
  }

  let conteudo: ReactNode;
  if (status === "erro") {
    conteudo = <ErroAoCarregar aoTentarDeNovo={() => void gerenciador("configuracoes").recarregar()} />;
  } else if (status !== "pronto") {
    conteudo = (
      <div className="flex flex-col gap-2 p-2" aria-busy>
        {[0, 1].map((i) => (
          <Esqueleto key={i} className="h-toque" />
        ))}
      </div>
    );
  } else {
    conteudo = (
      <form
        className="flex flex-wrap items-start gap-3 px-2 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <div className="w-44">
          <Campo
            rotulo={ROTULOS.limite_ajuste}
            inputMode="decimal"
            className="texto-number"
            value={valores.limite}
            maxLength={20}
            disabled={salvando}
            erro={erros.limite}
            onChange={(e) => mudar("limite", e.target.value)}
          />
        </div>
        <div className="w-52">
          <Campo
            rotulo={ROTULOS.tolerancia_atraso}
            inputMode="numeric"
            className="texto-number"
            value={valores.tolerancia}
            maxLength={3}
            disabled={salvando}
            erro={erros.tolerancia}
            onChange={(e) => mudar("tolerancia", e.target.value)}
          />
        </div>
        <div className="pt-5">
          <Botao type="submit" variante="primario" disabled={salvando}>
            {ROTULOS.salvar}
          </Botao>
        </div>
      </form>
    );
  }

  return (
    <section
      aria-labelledby="titulo-conferencia"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
    >
      <header className="flex items-center">
        <h2 id="titulo-conferencia" className="flex-1 texto-body-strong">
          {ROTULOS.conferencia}
        </h2>
      </header>
      {conteudo}
    </section>
  );
}
