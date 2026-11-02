import { redirect } from "next/navigation";
import { mensagem } from "@/domain/mensagens";
import { temSessao } from "@/data/supabase/servidor";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { itemDaRota } from "@/ui/navegacao";
import { Tela } from "@/ui/Tela";

const item = itemDaRota("/");

// Painel provisório: o conteúdo chega nas próximas histórias.
export default async function PaginaPainel() {
  // Confere a sessão aqui também, sem depender só do proxy.
  if (!(await temSessao())) redirect("/entrar");

  return (
    <Tela titulo={item.titulo}>
      <EstadoVazio texto={mensagem("app.em_breve")} />
    </Tela>
  );
}
