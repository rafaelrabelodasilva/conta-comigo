import "server-only";

// Prompt da extração da Fatura (AD-7). O formato da resposta vem do schema
// único (`responseJsonSchema`); aqui ficam só as regras de leitura.

export const INSTRUCAO_EXTRACAO = `Você lê o texto de uma fatura de cartão de crédito do Santander (Brasil) e devolve os dados no schema JSON pedido.

Regras:
- Inclua TODOS os lançamentos de TODOS os cartões (titular e adicionais), na ordem em que aparecem: compras, parcelamentos, anuidades, tarifas, juros, IOF, créditos e estornos.
- Não inclua o pagamento da fatura anterior (ex.: "PAGAMENTO DE FATURA", "DEB AUTOM DE FATURA") como lançamento; ele só entra em "pagamentos".
- Não inclua linhas de total, subtotal, saldo, limite, resumo ou propaganda como lançamento.
- "nome": a descrição exatamente como está no texto, sem a data, sem a parcela e sem o valor.
- "data": DD/MM, como no texto.
- "parcela": quando a descrição traz a parcela (ex.: "02/12" ou "PARC 02/12"), escreva "02/12" (atual/total) e tire isso do nome; se não é parcelado, null.
- "valor": no formato brasileiro "1.234,56". Créditos e estornos levam "-" na frente (ex.: "-0,08"). Despesas não levam sinal.
- "final_cartao": os 4 últimos dígitos do cartão em cuja seção o lançamento aparece.
- "tipo_sugerido": escolha um nome da lista de Tipos enviada, escrito exatamente igual, só se ele claramente servir; senão null.
- "duvida": true se você não tiver certeza de algum campo do lançamento.
- "fatura": vencimento e fechamento em DD/MM/AAAA; total de despesas, total de créditos (sem sinal), saldo anterior, pagamentos e total a pagar como estão no resumo da fatura (null se não houver).
- "cartoes": um item por cartão, com o final de 4 dígitos e o "VALOR TOTAL" desse cartão.
- Nunca invente lançamentos nem valores.`;

/** A mensagem do usuário: a lista de Tipos e o texto da Fatura. */
export function montarPedidoExtracao(texto: string, nomesTipos: readonly string[]): string {
  const tipos = nomesTipos.length > 0 ? nomesTipos.map((n) => `- ${n}`).join("\n") : "(nenhum Tipo cadastrado: use null)";
  return `Tipos disponíveis:\n${tipos}\n\nTexto da fatura:\n<<<\n${texto}\n>>>`;
}
