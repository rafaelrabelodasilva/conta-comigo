import { comporTotalAPagar, type TotaisLidosDaFatura } from "@/domain/importacao-fatura";
import { rotuloComposicaoTotal, rotuloConferenciaTotal, rotuloTotalAPagar } from "@/domain/mensagens";

// "Total a pagar" da Fatura e como os Lançamentos chegam a ele (soma dos
// Lançamentos + saldo anterior − pagamentos), para conferir com o valor da
// fatura do cartão. Usado no passo 3 da importação e no cartão do Painel.

export function TotalAPagar({
  fatura,
  valoresCentavos,
}: {
  fatura: TotaisLidosDaFatura;
  /** Valor de cada Lançamento da Fatura (créditos negativos). */
  valoresCentavos: readonly number[];
}) {
  const c = comporTotalAPagar(fatura, valoresCentavos);
  const selo = rotuloConferenciaTotal(c);
  return (
    <div className="flex flex-col gap-1">
      <p className="texto-title texto-number">{rotuloTotalAPagar(c.lidoCentavos)}</p>
      <p className="texto-number text-text-muted">{rotuloComposicaoTotal(c)}</p>
      {selo ? (
        <p className={c.diferencaCentavos === 0 ? "texto-body-strong text-accent" : "texto-body-strong"}>{selo}</p>
      ) : null}
    </div>
  );
}
