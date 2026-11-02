import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conta Comigo",
  description: "Divida a fatura do cartão de crédito entre quem comprou.",
};

// O tema segue o sistema (claro ou escuro); os tokens mudam sem recarregar.
export const viewport: Viewport = {
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-text">{children}</body>
    </html>
  );
}
