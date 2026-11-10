import type { ReactNode } from "react";
import { mensagem } from "@/domain/mensagens";
import { FaixaSemConexao } from "@/features/conexao/FaixaSemConexao";
import { AplicarTema } from "@/features/configuracoes/AplicarTema";
import { MenuLateral } from "@/features/revisar/MenuLateral";
import { ToastProvider } from "@/ui/Toast";

// Layout das telas autenticadas: menu lateral fixo (com o contador do Revisar) e conteúdo. Cada página
// confere a sessão por conta própria (o proxy também confere).
// A faixa "Sem conexão" fica no topo do conteúdo.
// Abaixo de 700 px (celular, fora da v1), só o aviso de tela pequena.
// `AplicarTema` segue a Aparência de Configurações em tempo real.
export default function LayoutApp({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AplicarTema />
      <div className="hidden h-dvh app:flex">
        <MenuLateral />
        <div className="flex min-w-0 flex-1 flex-col">
          <FaixaSemConexao />
          <main className="min-h-0 min-w-0 flex-1 overflow-auto p-4">{children}</main>
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
