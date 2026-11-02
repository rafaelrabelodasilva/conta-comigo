import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROTULOS, mensagem } from "@/domain/mensagens";
import { temSessao } from "@/data/supabase/servidor";
import { sair } from "@/features/entrar/acoes";
import { Botao } from "@/ui/Botao";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { itemDaRota } from "@/ui/navegacao";
import { Tela } from "@/ui/Tela";

const item = itemDaRota("/configuracoes");

export const metadata: Metadata = { title: `${item.titulo} · Conta Comigo` };

// Configurações provisória: as seções chegam nas Histórias 1.4 a 1.7.
// "Sair" mora aqui (IA do EXPERIENCE.md) e encerra a sessão neste aparelho.
export default async function PaginaConfiguracoes() {
  // Confere a sessão aqui também, sem depender só do proxy.
  if (!(await temSessao())) redirect("/entrar");

  return (
    <Tela titulo={item.titulo}>
      <EstadoVazio texto={mensagem("app.em_breve")} />
      <form action={sair}>
        <Botao type="submit" variante="secundario">
          {ROTULOS.sair}
        </Botao>
      </form>
    </Tela>
  );
}
