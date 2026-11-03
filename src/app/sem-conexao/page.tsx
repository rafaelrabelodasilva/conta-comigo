import type { Metadata } from "next";
import { NOME_APP } from "@/app/marca";
import { FaixaSemConexao } from "@/features/conexao/FaixaSemConexao";
import { TentarDeNovo } from "@/features/conexao/TentarDeNovo";

export const metadata: Metadata = { title: NOME_APP };

// Casco sem dados: o service worker guarda esta página no `install` e a
// mostra quando a navegação falha sem rede (app aberto sem internet e sem
// nada carregado). Abre sem sessão (não lê nada do banco).
export default function PaginaSemConexao() {
  return (
    <div className="flex min-h-dvh flex-col">
      <FaixaSemConexao fixa />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="texto-title">{NOME_APP}</h1>
        <TentarDeNovo />
      </main>
    </div>
  );
}
