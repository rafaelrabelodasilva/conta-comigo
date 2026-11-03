"use client";

import { mensagem } from "@/domain/mensagens";
import { useConexao } from "@/data/conexao";

// Faixa "Sem conexão" (`offline-banner`): fina, no topo do conteúdo, em
// `nav` com texto `nav-label`. Os dados já carregados continuam na tela.
// O contêiner `role="status"` fica sempre montado para o VoiceOver anunciar
// quando o texto aparece. `fixa`: mostra mesmo com `navigator.onLine`
// verdadeiro (a página `/sem-conexao` só abre quando a rede falhou).
export function FaixaSemConexao({ fixa = false }: { fixa?: boolean }) {
  const online = useConexao();
  const mostrar = fixa || !online;
  return (
    <div role="status" className="shrink-0">
      {mostrar ? (
        <p className="bg-nav px-4 py-1.5 texto-label text-nav-label">{mensagem("conexao.sem_conexao")}</p>
      ) : null}
    </div>
  );
}
