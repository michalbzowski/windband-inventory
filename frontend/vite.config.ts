import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server on :5173 (matches Keycloak client `windband-inventory` valid
// redirect URIs: http://localhost:5173/*). The /api proxy makes WM calls
// same-origin for the browser (no CORS needed); production serves the SPA
// behind nginx which routes /api to windband-manager (same contract).
//
// Runtime env for the dev/preview servers: /env.js is generated from
// process.env (AUTH_ISSUER, AUTH_CLIENT_ID) — the SAME names the nginx
// container uses (deploy/nginx/env.js.template), so one codebase works in both.
const ENV_DEFAULTS = {
  AUTH_ISSUER: 'http://localhost:8180/realms/windband',
  AUTH_CLIENT_ID: 'windband-inventory',
};

function envJsBody(): string {
  const cfg = {
    authIssuer: process.env.AUTH_ISSUER || ENV_DEFAULTS.AUTH_ISSUER,
    clientId: process.env.AUTH_CLIENT_ID || ENV_DEFAULTS.AUTH_CLIENT_ID,
  };
  return `window.__WI_ENV__=${JSON.stringify(cfg)};\n`;
}

function serveEnvJs(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  if (req.url === '/env.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-store');
    res.end(envJsBody());
    return;
  }
  next();
}

/** Serves /env.js from process.env on the dev and preview servers — the local
 * twin of nginx's envsubst rendering of deploy/nginx/env.js.template. */
function runtimeEnvPlugin(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) =>
    serveEnvJs(req, res, next);
  return {
    name: 'windband-inventory:runtime-env',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), runtimeEnvPlugin()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // More specific prefix first: the inventory backend has its own Spring
      // service; /api/v1 (bands, roster) keeps going to WM. Mirrors the
      // nginx template (location ^~ /api/inventory/ vs location ^~ /api/).
      '/api/inventory': {
        target: process.env.WI_TARGET ?? 'http://localhost:8090',
        changeOrigin: false,
      },
      '/api': {
        target: process.env.WM_TARGET ?? 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
  preview: { port: 5173 },
});
