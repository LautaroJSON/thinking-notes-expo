// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite en web usa un módulo WebAssembly.
config.resolver.assetExts.push('wasm');

// expo-sqlite en web necesita SharedArrayBuffer, que solo existe con
// aislamiento entre orígenes. Se usa COEP require-corp (y no credentialless)
// porque Safari no soporta credentialless. Producción: vercel.json.
// Ver specs/006-expo-offline-foundation/contracts/web-headers.md
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    middleware(req, res, next);
  };
};

module.exports = config;
