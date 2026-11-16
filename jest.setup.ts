// Configuración global de Jest.

// expo-crypto: en Jest no hay módulo nativo; se usa el randomUUID de Node,
// que genera el mismo formato (UUID v4).
jest.mock("expo-crypto", () => ({
  randomUUID: () => jest.requireActual<typeof import("node:crypto")>("node:crypto").randomUUID(),
}));

// expo-sqlite: el módulo nativo no corre en Node. Los tests usan el adaptador
// de node:sqlite (src/services/notes/testing) o un repositorio falso; si algo
// intenta abrir la base real, falla de forma explícita.
jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() =>
    Promise.reject(new Error("expo-sqlite no está disponible en Jest")),
  ),
}));
