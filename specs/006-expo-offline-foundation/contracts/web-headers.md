# Contrato: cabeceras HTTP de la web

Toda respuesta de la web, tanto en desarrollo (`npx expo start --web`) como en el despliegue
de Vercel, DEBE incluir:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Con ellas, `crossOriginIsolated === true` en el navegador y `SharedArrayBuffer` queda
disponible para `expo-sqlite`. Ver research R2 sobre por qué se usa `require-corp` y no
`credentialless`.

| Entorno | Dónde se configura |
|---------|--------------------|
| Desarrollo | `metro.config.js` → `config.server.enhanceMiddleware` |
| Vercel | `vercel.json` → `headers: [{ source: "/(.*)", headers: [...] }]` |

`vercel.json` también define el build (`expo export -p web`), la salida (`dist`) y el
rewrite de SPA (`/:path*` → `/`).

**Regla de la constitución**: ningún cambio posterior puede quitar estas cabeceras.
