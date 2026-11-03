import type { ReactNode } from "react";
import { mensagem } from "@/domain/mensagens";
import { FaixaSemConexao } from "@/features/conexao/FaixaSemConexao";
import { AplicarTema } from "@/features/configuracoes/AplicarTema";
import { ToastProvider } from "@/ui/Toast";

// Layout do Primeiro uso: tela cheia, sem o menu lateral, com toast e a
// Aparência de Configurações (como as telas autenticadas). A página confere
// a sessão por conta própria (o proxy também confere).
// A faixa "Sem conexão" fica no topo do conteúdo.
// Abaixo de 700 px (celular, fora da v1), só o aviso de tela pequena.
export default function LayoutPrimeiroUso({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AplicarTema />
      <div className="hidden h-dvh app:flex">
        <div className="flex min-w-0 flex-1 flex-col">
          <FaixaSemConexao />
          <main className="min-h-0 min-w-0 flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
      <div className="flex min-h-dvh items-center justify-center p-6 text-center app:hidden">
        <p role="status" className="max-w-xs texto-title">
          {mensagem("app.tela_pequena")}
        </p>
      </div>
    </ToastProvider>
  );
}
