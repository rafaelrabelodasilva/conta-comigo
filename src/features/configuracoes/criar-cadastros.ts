// Cria, para a importação da planilha (História 3.10), os Responsáveis, Tipos
// e Status que faltam e reativa os arquivados de mesmo nome. Usa só os
// repositórios de cadastros; a cor do Responsável sai do núcleo
// (`proximaCor`). Para antes de criar qualquer um se não couberem as 8 cores.

import type { PlanoDeCadastros } from "@/domain/importacao-planilha";
import { proximaCor, proximaOrdem, type Responsavel } from "@/domain/responsaveis";
import type { ResultadoGravacao } from "@/data/gravacao";

export type PortasDeCadastro = {
  responsaveis: {
    criar: (novo: { nome: string; cor: number; ordem: number }) => Promise<ResultadoGravacao>;
    desarquivar: (id: string, ordem: number) => Promise<ResultadoGravacao>;
  };
  tipos: {
    criar: (novo: { nome: string }) => Promise<ResultadoGravacao>;
    desarquivar: (id: string) => Promise<ResultadoGravacao>;
  };
  status: {
    criar: (novo: { nome: string }) => Promise<ResultadoGravacao>;
    desarquivar: (id: string) => Promise<ResultadoGravacao>;
    definirContaComoPago: (id: string, contaComoPago: boolean) => Promise<ResultadoGravacao>;
  };
  /** Os Responsáveis (com cor e ordem) e os Status de agora, lidos do banco. */
  ler: () => Promise<{ ok: true; responsaveis: Responsavel[]; status: readonly { id: string; nome: string }[] } | { ok: false }>;
};

/** Cabem os Responsáveis novos nas 8 cores (os arquivados também reservam a deles)? */
export function cabemOsResponsaveis(existentes: readonly Responsavel[], quantos: number): boolean {
  const lista = [...existentes];
  for (let i = 0; i < quantos; i++) {
    const cor = proximaCor(lista);
    if (!cor.ok) return false;
    lista.push({ id: `novo:${i}`, nome: `novo:${i}`, cor: cor.valor, ordem: proximaOrdem(lista), arquivado: false });
  }
  return true;
}

export async function criarCadastrosDaPlanilha(
  plano: PlanoDeCadastros,
  portas: PortasDeCadastro,
): Promise<{ ok: true } | { ok: false; codigo: string }> {
  const lidos = await portas.ler();
  if (!lidos.ok) return { ok: false, codigo: "carregar.falhou" };
  const responsaveis = [...lidos.responsaveis];
  if (!cabemOsResponsaveis(responsaveis, plano.criar.responsaveis.length)) {
    return { ok: false, codigo: "responsavel.sem_cor_livre" };
  }

  for (const id of plano.reativar.responsaveis) {
    const r = await portas.responsaveis.desarquivar(id, proximaOrdem(responsaveis));
    if (!r.ok) return { ok: false, codigo: r.codigo };
    const i = responsaveis.findIndex((x) => x.id === id);
    if (i >= 0) responsaveis[i] = { ...responsaveis[i], arquivado: false, ordem: proximaOrdem(responsaveis) };
  }
  for (const nome of plano.criar.responsaveis) {
    const cor = proximaCor(responsaveis);
    if (!cor.ok) return { ok: false, codigo: cor.erro.codigo };
    const ordem = proximaOrdem(responsaveis);
    const r = await portas.responsaveis.criar({ nome, cor: cor.valor, ordem });
    if (!r.ok) return { ok: false, codigo: r.codigo };
    responsaveis.push({ id: `novo:${nome}`, nome, cor: cor.valor, ordem, arquivado: false });
  }
  for (const id of plano.reativar.tipos) {
    const r = await portas.tipos.desarquivar(id);
    if (!r.ok) return { ok: false, codigo: r.codigo };
  }
  for (const nome of plano.criar.tipos) {
    const r = await portas.tipos.criar({ nome });
    if (!r.ok) return { ok: false, codigo: r.codigo };
  }
  for (const id of plano.reativar.status) {
    const r = await portas.status.desarquivar(id);
    if (!r.ok) return { ok: false, codigo: r.codigo };
  }
  for (const s of plano.criar.status) {
    const r = await portas.status.criar({ nome: s.nome });
    if (!r.ok) return { ok: false, codigo: r.codigo };
  }
  // "Pago" conta como pago: o id do Status novo só existe depois de criado.
  const contam = plano.criar.status.filter((s) => s.conta_como_pago);
  if (contam.length > 0) {
    const depois = await portas.ler();
    if (!depois.ok) return { ok: false, codigo: "carregar.falhou" };
    for (const s of contam) {
      const achado = depois.status.find((x) => x.nome === s.nome);
      if (!achado) return { ok: false, codigo: "salvar.falhou" };
      const r = await portas.status.definirContaComoPago(achado.id, true);
      if (!r.ok) return { ok: false, codigo: r.codigo };
    }
  }
  return { ok: true };
}
