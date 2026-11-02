// Regras puras de Configurações (História 1.7): Aparência, limite do Ajuste
// e tolerância de atraso. Os limites são os mesmos dos checks do banco
// (migração 20261102150000_ciclo_aparencia.sql).

import { lerReais } from "./dinheiro";
import type { Resultado } from "./resultado";

/** Tema: segue o sistema ou fica fixo. Vale em todos os aparelhos. */
export const APARENCIAS = ["sistema", "claro", "escuro"] as const;

export type Aparencia = (typeof APARENCIAS)[number];

export const APARENCIA_PADRAO: Aparencia = "sistema";

/** Limite do Ajuste (Épico 2): padrão R$ 1,00; de R$ 0,01 a R$ 10,00. */
export const LIMITE_AJUSTE_PADRAO_CENTAVOS = 100;
export const LIMITE_AJUSTE_MIN_CENTAVOS = 1;
export const LIMITE_AJUSTE_MAX_CENTAVOS = 1000;

/** Tolerância de atraso (Épico 6): padrão 10 dias; de 0 a 60. */
export const TOLERANCIA_ATRASO_PADRAO_DIAS = 10;
export const TOLERANCIA_ATRASO_MIN_DIAS = 0;
export const TOLERANCIA_ATRASO_MAX_DIAS = 60;

export function ehAparencia(valor: unknown): valor is Aparencia {
  return typeof valor === "string" && (APARENCIAS as readonly string[]).includes(valor);
}

/** A Aparência de um valor qualquer (cookie, linha); desconhecido → "sistema". */
export function aparenciaDe(valor: unknown): Aparencia {
  return ehAparencia(valor) ? valor : APARENCIA_PADRAO;
}

/** Limite do Ajuste digitado em reais ("1,50") → centavos. */
export function validarLimiteAjuste(texto: string): Resultado<number> {
  const lido = lerReais(texto);
  if (!lido.ok) return { ok: false, erro: { codigo: "ajuste.limite_invalido" } };
  if (lido.valor < LIMITE_AJUSTE_MIN_CENTAVOS || lido.valor > LIMITE_AJUSTE_MAX_CENTAVOS) {
    return { ok: false, erro: { codigo: "ajuste.limite_fora" } };
  }
  return { ok: true, valor: lido.valor };
}

/** Tolerância de atraso digitada em dias inteiros. */
export function validarToleranciaAtraso(texto: string): Resultado<number> {
  const limpo = texto.trim();
  if (!/^\d{1,3}$/.test(limpo)) return { ok: false, erro: { codigo: "atraso.tolerancia_invalida" } };
  const dias = Number(limpo);
  if (dias < TOLERANCIA_ATRASO_MIN_DIAS || dias > TOLERANCIA_ATRASO_MAX_DIAS) {
    return { ok: false, erro: { codigo: "atraso.tolerancia_invalida" } };
  }
  return { ok: true, valor: dias };
}
