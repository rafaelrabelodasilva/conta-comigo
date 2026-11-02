"use client";

import { useState, type ReactNode } from "react";
import {
  formatarMes,
  hojeEmSaoPaulo,
  planejarMudancaCiclo,
  resumoDoCiclo,
  validarDia,
} from "@/domain/ciclo";
import { ROTULOS, mensagem, rotuloCicloAtual, rotuloProximoCiclo } from "@/domain/mensagens";
import { repoCiclo } from "@/data/ciclo-repo";
import { gerenciador, useLinhas } from "@/data/realtime";
import { Botao } from "@/ui/Botao";
import { Campo } from "@/ui/Campo";
import { ErroAoCarregar } from "@/ui/ErroAoCarregar";
import { Esqueleto } from "@/ui/Esqueleto";
import { useToast } from "@/ui/Toast";
import { useAvisarRascunho, type PropsSecao } from "./rascunho";

// Configurações → Ciclo do cartão. Lê só pelo gerenciador de Realtime
// (`config_ciclo`) e grava só pelo repositório, que só insere. O Mês a
// partir do qual a mudança vale vem do núcleo (`planejarMudancaCiclo`); a
// primeira configuração vale já para o Ciclo de hoje.

type Rascunho = { fechamento: string; vencimento: string };

export function SecaoCiclo({ aoMudarRascunho }: PropsSecao = {}) {
  const { status, linhas } = useLinhas("config_ciclo");
  const toast = useToast();
  // "Hoje" em São Paulo, um só por render: o resumo, os campos e o salvar
  // usam o mesmo valor.
  const hoje = hojeEmSaoPaulo(new Date());
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erros, setErros] = useState<{ fechamento?: string; vencimento?: string }>({});
  const [salvando, setSalvando] = useState(false);

  const resumo = resumoDoCiclo(hoje, linhas);
  // Os campos começam com os dias que vão valer (a mudança salva, se houver).
  const base = resumo.proxima?.config ?? resumo.atual?.config;
  const salvos: Rascunho = {
    fechamento: base ? String(base.dia_fechamento) : "",
    vencimento: base ? String(base.dia_vencimento) : "",
  };
  const valores: Rascunho = rascunho ?? salvos;
  // Só no Primeiro uso: avisa se os dias digitados diferem dos salvos.
  useAvisarRascunho(
    valores.fechamento.trim() !== salvos.fechamento || valores.vencimento.trim() !== salvos.vencimento,
    aoMudarRascunho,
  );

  function mudar(campo: keyof Rascunho, valor: string) {
    setRascunho({ ...valores, [campo]: valor });
    setErros((e) => ({ ...e, [campo]: undefined }));
  }

  async function salvar() {
    const fechamento = validarDia(valores.fechamento);
    const vencimento = validarDia(valores.vencimento);
    if (!fechamento.ok || !vencimento.ok) {
      setErros({
        fechamento: fechamento.ok ? undefined : mensagem(fechamento.erro.codigo),
        vencimento: vencimento.ok ? undefined : mensagem(vencimento.erro.codigo),
      });
      return;
    }
    const plano = planejarMudancaCiclo(hoje, linhas, {
      dia_fechamento: fechamento.valor,
      dia_vencimento: vencimento.valor,
    });
    if (!plano.ok) {
      toast.mostrar({ texto: mensagem(plano.erro.codigo) });
      return;
    }
    if (plano.valor === null) {
      setRascunho(null); // já é o que vai valer: nada a gravar
      return;
    }
    setSalvando(true);
    const r = await repoCiclo().inserir(plano.valor);
    setSalvando(false);
    if (!r.ok) {
      toast.mostrar({ texto: mensagem(r.codigo) });
      return;
    }
    setRascunho(null);
  }

  let conteudo: ReactNode;
  if (status === "erro") {
    conteudo = <ErroAoCarregar aoTentarDeNovo={() => void gerenciador("config_ciclo").recarregar()} />;
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
      <div className="flex flex-col gap-3 px-2 pb-2">
        <form
          className="flex flex-wrap items-start gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
        >
          <div className="w-40">
            <Campo
              rotulo={ROTULOS.dia_fechamento}
              inputMode="numeric"
              className="texto-number"
              value={valores.fechamento}
              maxLength={2}
              disabled={salvando}
              erro={erros.fechamento}
              onChange={(e) => mudar("fechamento", e.target.value)}
            />
          </div>
          <div className="w-40">
            <Campo
              rotulo={ROTULOS.dia_vencimento}
              inputMode="numeric"
              className="texto-number"
              value={valores.vencimento}
              maxLength={2}
              disabled={salvando}
              erro={erros.vencimento}
              onChange={(e) => mudar("vencimento", e.target.value)}
            />
          </div>
          <div className="pt-5">
            <Botao type="submit" variante="primario" disabled={salvando}>
              {ROTULOS.salvar}
            </Botao>
          </div>
        </form>
        <p className="texto-label font-normal text-text-muted">{ROTULOS.nota_ciclo}</p>
        <div role="status" className="flex flex-col gap-1 texto-body text-text">
          {resumo.atual ? (
            <p>
              {rotuloCicloAtual(
                formatarMes(resumo.atual.mes),
                resumo.atual.config.dia_fechamento,
                resumo.atual.config.dia_vencimento,
              )}
            </p>
          ) : null}
          {resumo.proxima ? (
            <p className="texto-body-strong">
              {rotuloProximoCiclo(
                formatarMes(resumo.proxima.mes),
                resumo.proxima.config.dia_fechamento,
                resumo.proxima.config.dia_vencimento,
              )}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="titulo-ciclo"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
    >
      <header className="flex items-center">
        <h2 id="titulo-ciclo" className="flex-1 texto-body-strong">
          {ROTULOS.ciclo}
        </h2>
      </header>
      {conteudo}
    </section>
  );
}
