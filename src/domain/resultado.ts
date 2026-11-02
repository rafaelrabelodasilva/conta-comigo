// Formato único de resultado do núcleo: `{ ok: true, valor }` ou
// `{ ok: false, erro: { codigo, detalhe } }`. Regras de negócio não lançam exceção.

export type Resultado<T> =
  | { ok: true; valor: T }
  | { ok: false; erro: { codigo: string; detalhe?: string } };
