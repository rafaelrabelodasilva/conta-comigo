import type { ReactNode } from "react";
import { mensagem } from "@/domain/mensagens";
import { FaixaSemConexao } from "@/features/conexao/FaixaSemConexao";
import { AplicarTema } from "@/features/configuracoes/AplicarTema";
import { ReativarNotificacoes } from "@/features/configuracoes/ReativarNotificacoes";
import { MenuLateral } from "@/features/revisar/MenuLateral";
import { ToastProvider } from "@/ui/Toast";

// Layout das telas autenticadas: menu lateral fixo (com os contadores do Revisar e dos Avisos) e conteúdo. Cada
// página confere a sessão por conta própria (o proxy também confere).
// A faixa "Sem conexão" fica no topo do conteúdo. Os lembretes (fechamento da fatura e Bloco com itens atrasados)
// não ocupam mais o topo das telas (8.1): moram na Central de Avisos (`/avisos`), com o contador no menu lateral.
// Abaixo de 700 px (celular, fora da v1), só o aviso de tela pequena.
// `AplicarTema` segue a Aparência de Configurações em tempo real. `ReativarNotificacoes` refaz, ao abrir o app, a
// inscrição de notificações que o navegador perdeu (Defeito 8): só com a permissão já dada, sem pedi-la de novo.
export default function LayoutApp({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AplicarTema />
      <ReativarNotificacoes />
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
