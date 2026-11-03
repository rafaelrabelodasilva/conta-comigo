import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { RegistrarServiceWorker } from "@/features/conexao/RegistrarServiceWorker";
import { aparenciaDoCookie, atributoTema, COOKIE_TEMA, esquemaDeCor } from "@/features/configuracoes/tema";
import { NOME_APP } from "./marca";
import "./globals.css";

// `appleWebApp`: instalado pela tela inicial do iPad, abre em tela cheia com
// o nome do app e a barra de status sobre o fundo escuro do menu.
export const metadata: Metadata = {
  title: NOME_APP,
  description: "Divida a fatura do cartão de crédito entre quem comprou.",
  appleWebApp: { capable: true, title: NOME_APP, statusBarStyle: "black" },
};

// O tema segue o sistema ou a Aparência fixada em Configurações. O cookie
// `tema` (gravado por `AplicarTema`) deixa a primeira pintura já certa; a
// verdade é `configuracoes.aparencia`, aplicada em tempo real no navegador.
async function aparenciaPedida() {
  return aparenciaDoCookie((await cookies()).get(COOKIE_TEMA)?.value);
}

export async function generateViewport(): Promise<Viewport> {
  return { colorScheme: esquemaDeCor(await aparenciaPedida()) };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const tema = atributoTema(await aparenciaPedida());
  return (
    <html lang="pt-BR" className="h-full antialiased" data-tema={tema}>
      <body className="flex min-h-full flex-col bg-background text-text">
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
