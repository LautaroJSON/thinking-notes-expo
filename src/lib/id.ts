import { randomUUID } from "expo-crypto";

/** Genera un id único (UUID v4). Funciona igual en Android y en web. */
export const newId = (): string => randomUUID();
