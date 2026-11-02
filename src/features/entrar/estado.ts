import type { CodigoMensagem } from "@/domain/mensagens";

// Estado dos formulários de Entrar (useActionState). Só o código: o texto
// vem do mapa de mensagens na hora de mostrar.
export type EstadoFormulario = {
  codigo: CodigoMensagem | null;
  /** true quando o código é uma confirmação, não um erro. */
  ok?: boolean;
  /** E-mail digitado, devolvido no erro para o formulário não perdê-lo. Nunca a senha. */
  email?: string;
};

export const ESTADO_INICIAL: EstadoFormulario = { codigo: null };
