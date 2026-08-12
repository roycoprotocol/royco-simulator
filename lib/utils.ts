import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Ported from royco-rwa-frontend so the shadcn primitives compose identically. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
