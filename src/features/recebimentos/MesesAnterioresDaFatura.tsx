"use client";

import { useState } from "react";
import { formatarMes } from "@/domain/datas";
import { formatarDinheiro } from "@/domain/dinheiro";
import {
  TEXTOS_MESES_ANTERIORES as T,
  rotuloContinuidade,
  rotuloSeloConferencia,
  rotuloVerOutrosMeses,
} from "@/domain/mensagens";
import { MESES_VISIVEIS_NA_TABELA, type LinhaDosMesesAnteriores } from "@/domain/meses-anteriores";
import { valorDaDiferenca } from "@/domain/conferencia";
import { Botao } from "@/ui/Botao";
import { cn } from "@/ui/cn";
import { Esqueleto } from "@/ui/Esqueleto";
import { EstadoVazio } from "@/ui/EstadoVazio";

// "Meses anteriores da Fatura" (História 6.8, FR-30, UX-DR22): uma linha por Fatura importada, do Mês mais novo para o
// mais antigo, com o saldo anterior e o pagamento que a Fatura escreveu, o resíduo (saldo anterior − pagamento) e o selo
// da Conferência. Tudo vem pronto de `montarMesesAnteriores`: a tela só desenha.
//
// - O selo é sempre texto ("✓ Conferido" ou "⚠ Diferença de R$ X"), como o do Painel; um alerta dispensado não muda o
//   selo, só ganha o aviso "alerta dispensado".
// - Valor que a Fatura não trouxe: "—". O aviso de continuidade (o saldo anterior não é o total a pagar do Mês
//   anterior) fica sob o saldo anterior, discreto.
// - Mostra os 12 Meses mais novos; os outros ficam atrás de "Ver os outros N meses" (a lista cresce uns 12 por ano).

const CELULA = "px-3.5 py-2 align-top";
const NUMERO = "text-right texto-number tabular-nums whitespace-nowrap";

function Valor({ centavos }: { centavos: number | null }) {
  return centavos === null ? (
    <span className="text-text-muted">{T.sem_valor}</span>
  ) : (
    <span>{formatarDinheiro(centavos)}</span>
  );
}

function Linha({ linha }: { linha: LinhaDosMesesAnteriores }) {
  const conferido = valorDaDiferenca(linha.conferencia) === null;
  return (
    <tr className="border-t border-border-subtle">
      <th scope="row" className={cn(CELULA, "text-left texto-body-strong whitespace-nowrap")}>
        {formatarMes(linha.mes)}
      </th>
      <td className={cn(CELULA, NUMERO)}>
        <Valor centavos={linha.saldoAnteriorCentavos} />
        {linha.continuidade ? (
          <span className="mt-0.5 block text-right font-normal texto-caption text-text-muted">
            {rotuloContinuidade(linha.continuidade.mesAnterior, linha.continuidade.totalAPagarCentavos)}
          </span>
        ) : null}
      </td>
      <td className={cn(CELULA, NUMERO)}>
        <Valor centavos={linha.pagamentoCentavos} />
      </td>
      <td className={cn(CELULA, NUMERO)}>
        <Valor centavos={linha.residuoCentavos} />
        {linha.residuoCentavos !== null && linha.residuoCentavos < 0 ? (
          <span className="block font-normal texto-caption text-text-muted">{T.pago_a_mais}</span>
        ) : null}
      </td>
      <td className={cn(CELULA, "texto-body")}>
        <span className={conferido ? "text-accent" : "text-text"}>{rotuloSeloConferencia(linha.conferencia)}</span>
        {!conferido && linha.alertaDispensado ? (
          <span className="block texto-caption text-text-muted">{T.alerta_dispensado}</span>
        ) : null}
      </td>
    </tr>
  );
}

export function MesesAnterioresDaFatura({
  linhas,
  carregando,
}: {
  linhas: readonly LinhaDosMesesAnteriores[];
  /** Os dados ainda não chegaram: o esqueleto no lugar da tabela (e de "Nenhuma fatura importada ainda"). */
  carregando: boolean;
}) {
  const [todas, setTodas] = useState(false);
  const visiveis = todas ? linhas : linhas.slice(0, MESES_VISIVEIS_NA_TABELA);
  const escondidas = linhas.length - MESES_VISIVEIS_NA_TABELA;
  const semTotais = linhas.length > 0 && linhas.every((l) => l.saldoAnteriorCentavos === null && l.pagamentoCentavos === null);

  return (
    <section aria-labelledby="titulo-meses-anteriores" className="flex flex-col gap-2">
      <h2 id="titulo-meses-anteriores" className="flex min-h-toque items-center texto-body-strong">
        {T.titulo}
      </h2>
      {carregando ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">{T.carregando}</span>
          <Esqueleto className="h-12" />
          <Esqueleto className="h-12" />
        </div>
      ) : linhas.length === 0 ? (
        <EstadoVazio texto={T.sem_faturas} className="p-4" />
      ) : (
        <>
          <p className="texto-caption text-text-muted">{T.ajuda}</p>
          {semTotais ? <p className="texto-caption text-text-muted">{T.sem_totais}</p> : null}
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table aria-labelledby="titulo-meses-anteriores" className="w-full min-w-[36rem] border-collapse">
              <thead>
                <tr className="texto-label text-text-muted">
                  <th scope="col" className={cn(CELULA, "text-left font-normal")}>
                    {T.coluna_mes}
                  </th>
                  <th scope="col" className={cn(CELULA, "text-right font-normal")}>
                    {T.coluna_saldo_anterior}
                  </th>
                  <th scope="col" className={cn(CELULA, "text-right font-normal")}>
                    {T.coluna_pagamento}
                  </th>
                  <th scope="col" className={cn(CELULA, "text-right font-normal")}>
                    {T.coluna_residuo}
                  </th>
                  <th scope="col" className={cn(CELULA, "text-left font-normal")}>
                    {T.coluna_conferencia}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <Linha key={l.faturaId} linha={l} />
                ))}
              </tbody>
            </table>
          </div>
          {escondidas > 0 ? (
            <Botao className="self-start" aria-expanded={todas} onClick={() => setTodas((t) => !t)}>
              {todas ? T.mostrar_so_recentes : rotuloVerOutrosMeses(escondidas)}
            </Botao>
          ) : null}
        </>
      )}
    </section>
  );
}
