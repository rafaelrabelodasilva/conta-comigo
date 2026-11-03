"use client";

import { ROTULOS } from "@/domain/mensagens";
import { PAGINA_INICIAL, PAGINA_SEM_CONEXAO } from "@/data/supabase/sessao";
import { Botao } from "@/ui/Botao";

// "Tentar de novo" da página `/sem-conexao`. O service worker mostra essa
// página no lugar da que falhou (o endereço continua o pedido): aí recarrega
// e tenta de novo a mesma página. Aberta direto, vai para o Painel. É um
// link comum (navegação completa), não do roteador do Next.
export function TentarDeNovo() {
  return (
    <Botao variante="primario" asChild>
      <a
        href={PAGINA_INICIAL}
        onClick={(e) => {
          if (window.location.pathname === PAGINA_SEM_CONEXAO) return;
          e.preventDefault();
          window.location.reload();
        }}
      >
        {ROTULOS.tentar_de_novo}
      </a>
    </Botao>
  );
}
