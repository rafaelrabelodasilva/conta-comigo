"use client";

import { useState } from "react";
import { descricaoDaRepeticao, type NovaConta } from "@/domain/contas-manuais";
import { hojeEmSaoPaulo } from "@/domain/datas";
import { formatarDinheiro } from "@/domain/dinheiro";
import { TEXTOS_CONTAS as T, rotuloContaSalva } from "@/domain/mensagens";
import { mesAtual as mesDeHoje } from "@/domain/painel";
import { repoContas, type ResultadoSalvarConta } from "@/data/contas-repo";
import { useConexao } from "@/data/conexao";
import { useLinhas } from "@/data/realtime";
import { Botao } from "@/ui/Botao";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { Tela } from "@/ui/Tela";
import { useToast } from "@/ui/Toast";
import { FormularioConta } from "./FormularioConta";

// Contas manuais (História 5.1, FR-16, FR-17, UX-DR24): "＋ Nova conta" abre o
// formulário e salva. A lista completa (filtros, ⋯ Editar/Encerrar/Excluir) é
// da 5.2; por ora a tela mostra só o que foi salvo nesta visita ("Salvas
// agora") e o aviso "Conta salva", e os Lançamentos aparecem nos Meses certos
// do Painel (os outros aparelhos os recebem pelo Realtime).

type Salva = { id: string; nome: string; descricao: string; valorCentavos: number };

export function ContasManuais({
  titulo,
  repo = repoContas(),
}: {
  titulo: string;
  /** O repositório (os testes passam um falso). */
  repo?: Pick<ReturnType<typeof repoContas>, "salvar">;
}) {
  // O relógio fica fora do núcleo: "hoje" é lido aqui, uma vez.
  const [mesAtual] = useState(() => mesDeHoje(hojeEmSaoPaulo(new Date())));
  const responsaveis = useLinhas("responsaveis");
  const tipos = useLinhas("tipos");
  const online = useConexao();
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [salvas, setSalvas] = useState<Salva[]>([]);
  const pronto = responsaveis.status === "pronto" && tipos.status === "pronto";

  async function salvar(conta: NovaConta): Promise<ResultadoSalvarConta> {
    const r = await repo.salvar(conta, mesAtual);
    if (!r.ok) return r;
    const c = r.conta;
    const descricao = descricaoDaRepeticao({
      repeticao: c.repeticao === "parcelas" ? "parcelas" : "mensal",
      parcela_total: c.parcela_total,
      mes_inicial: c.mes_inicial,
      encerrada_em_mes: c.encerrada_em_mes,
    });
    setSalvas((lista) => [
      { id: c.id, nome: c.nome, descricao, valorCentavos: c.valor_centavos },
      ...lista.filter((s) => s.id !== c.id),
    ]);
    toast.mostrar({ texto: rotuloContaSalva(r.criados) });
    return r;
  }

  return (
    <Tela
      titulo={titulo}
      acoes={
        <Botao variante="primario" aria-label={T.rotulo_nova} disabled={!pronto} onClick={() => setAberto(true)}>
          <span aria-hidden>＋</span>
          {T.botao_nova}
        </Botao>
      }
    >
      {salvas.length === 0 ? (
        <EstadoVazio texto={T.explicacao_vazio} />
      ) : (
        <section aria-labelledby="contas-salvas" className="flex flex-col gap-2">
          <h2 id="contas-salvas" className="texto-label text-text-muted">
            {T.salvas_agora}
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {salvas.map((s) => (
              <li key={s.id} className="flex min-h-toque items-center justify-between gap-3 px-4 py-2">
                <div className="min-w-0">
                  <p className="truncate texto-body-strong">{s.nome}</p>
                  <p className="texto-label font-normal text-text-muted">{s.descricao}</p>
                </div>
                <span className="shrink-0 texto-body-strong tabular-nums">{formatarDinheiro(s.valorCentavos)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {aberto ? (
        <FormularioConta
          aberta
          aoMudar={setAberto}
          mesAtual={mesAtual}
          responsaveis={responsaveis.linhas}
          tipos={tipos.linhas}
          online={online}
          aoSalvar={salvar}
        />
      ) : null}
    </Tela>
  );
}
