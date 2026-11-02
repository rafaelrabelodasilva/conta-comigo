"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/data/supabase/servidor";
import { destinoSeguro } from "@/data/supabase/sessao";
import { log } from "@/server/log";
import { codigoDoErroAuth } from "./erros";
import type { EstadoFormulario } from "./estado";

// Server Actions de Entrar. Cada uma cria o próprio cliente Supabase e
// confere a sessão por conta própria, sem depender só do proxy.
// O log registra só códigos, nunca o e-mail.

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

export async function entrar(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const email = texto(formData, "email").trim();
  const senha = texto(formData, "senha");
  // Senha só de espaços conta como vazia, mas a senha vai sem trim.
  if (!email || !senha.trim()) return { codigo: "auth.campos_vazios", email };

  const supabase = await criarClienteServidor();
  if (!supabase) return { codigo: "auth.indisponivel", email };

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });
    if (error) {
      const codigo = codigoDoErroAuth(error);
      log("auth.entrar_recusado", { nivel: "warn", codigo });
      return { codigo, email };
    }
  } catch {
    log("auth.entrar_falhou", { nivel: "error", codigo: "excecao" });
    return { codigo: "auth.erro_inesperado", email };
  }

  log("auth.entrou", { codigo: "ok" });
  // Fora do try: redirect() funciona lançando uma exceção.
  redirect(destinoSeguro(texto(formData, "next")));
}

/** Origem do app para o link do e-mail. O Supabase só aceita URLs da lista de redirecionamento. */
async function origemDaRequisicao(): Promise<string | null> {
  const h = await headers();
  const origem = h.get("origin");
  if (origem) return origem;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const protocolo = h.get("x-forwarded-proto") ?? "https";
  return `${protocolo}://${host}`;
}

export async function pedirRedefinicao(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const email = texto(formData, "email").trim();
  if (!email) return { codigo: "auth.email_vazio" };

  const supabase = await criarClienteServidor();
  if (!supabase) return { codigo: "auth.indisponivel" };

  // Sempre a mesma confirmação, exista ou não o e-mail, e mesmo com erro:
  // nada aqui pode revelar se há conta com esse endereço.
  try {
    const origem = await origemDaRequisicao();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: origem ? `${origem}/auth/confirmar` : undefined,
    });
    if (error) {
      log("auth.redefinicao_recusada", {
        nivel: "warn",
        codigo: error.code ?? codigoDoErroAuth(error),
      });
    } else {
      log("auth.redefinicao_pedida", { codigo: "ok" });
    }
  } catch {
    log("auth.redefinicao_falhou", { nivel: "error", codigo: "excecao" });
  }
  return { codigo: "auth.redefinicao_enviada", ok: true };
}

export async function redefinirSenha(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const senha = texto(formData, "senha");
  const confirmacao = texto(formData, "confirmacao");
  if (!senha || !confirmacao) return { codigo: "auth.senha_vazia" };
  if (senha !== confirmacao) return { codigo: "auth.senhas_diferentes" };

  const supabase = await criarClienteServidor();
  if (!supabase) return { codigo: "auth.indisponivel" };

  // A troca de senha exige a sessão (de recuperação) conferida aqui mesmo.
  let autenticado = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    autenticado = !error && Boolean(data?.claims);
  } catch {
    autenticado = false;
  }
  if (!autenticado) redirect("/entrar?motivo=link_expirou");

  try {
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      const mapeado = codigoDoErroAuth(error);
      // Aqui não há e-mail: erro de validação é da senha nova.
      const codigo =
        mapeado === "auth.credenciais_invalidas" ? "auth.senha_fraca" : mapeado;
      log("auth.senha_recusada", { nivel: "warn", codigo });
      return { codigo };
    }
  } catch {
    log("auth.senha_falhou", { nivel: "error", codigo: "excecao" });
    return { codigo: "auth.erro_inesperado" };
  }

  log("auth.senha_redefinida", { codigo: "ok" });
  redirect("/");
}

export async function sair(): Promise<void> {
  const supabase = await criarClienteServidor();
  if (supabase) {
    try {
      // Só esta sessão (este aparelho); as outras continuam.
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        log("auth.sair_recusado", { nivel: "warn", codigo: error.code ?? "sem_codigo" });
      }
    } catch {
      log("auth.sair_falhou", { nivel: "error", codigo: "excecao" });
    }
  }
  redirect("/entrar");
}
