import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Junta classes (condicionais) e resolve conflitos do Tailwind. Padrão shadcn/ui. */
export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}
