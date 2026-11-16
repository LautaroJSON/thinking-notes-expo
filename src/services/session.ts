import type { IsLoggedType } from "@/types";

/**
 * Modo de sesión con el que arranca la app. En esta etapa (spec 006) siempre
 * es "sin sesión"; la spec 007 lo reemplaza por la sesión real de Supabase.
 */
export const resolveSessionMode = async (): Promise<IsLoggedType> => "offline";
