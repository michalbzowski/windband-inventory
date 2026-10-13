/**
 * Runtime environment — values come from the SERVING LAYER, not from build time,
 * so one build artifact (npm run build / docker image) is identical in every
 * environment. Only env vars differ:
 *
 *  - `vite dev` / `vite preview`: middleware in vite.config.ts writes /env.js
 *    from process.env(AUTH_ISSUER, AUTH_CLIENT_ID).
 *  - nginx container (Dockerfile): deploy/nginx/env.js.template is rendered by
 *    envsubst from the container environment on startup (/etc/nginx/templates/),
 *    so changing values requires only `docker restart`-level changes, never a rebuild.
 *
 * Both paths expose the same endpoint: GET /env.js defining window.__WI_ENV__.
 * If /env.js is missing (static hosting without our middleware) the app falls
 * back to the local-dev defaults below and stays usable in development.
 */

export interface AppEnv {
  /** Full Keycloak issuer, e.g. https://login.bandmanager.pl/realms/windband */
  authIssuer?: string;
  /** OIDC client_id registered on that realm, canonical name: windband-inventory */
  clientId?: string;
}

declare global {
  interface Window {
    __WI_ENV__?: AppEnv;
  }
}

const DEFAULTS: Required<AppEnv> = {
  authIssuer: 'http://localhost:8180/realms/windband',
  clientId: 'windband-inventory',
};

export function getAuthIssuer(): string {
  return window.__WI_ENV__?.authIssuer || DEFAULTS.authIssuer;
}

export function getClientId(): string {
  return window.__WI_ENV__?.clientId || DEFAULTS.clientId;
}

/**
 * Loads /env.js (serving-layer) before first render. Never rejects: a missing
 * file degrades to DEFAULTS with a console warning, so local development keeps
 * working even without the dev-server middleware.
 */
export function loadRuntimeEnv(): Promise<void> {
  if (window.__WI_ENV__) return Promise.resolve();
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = '/env.js';
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => {
      console.warn('[env] /env.js not served — using built-in dev defaults', DEFAULTS);
      resolve();
    };
    document.head.appendChild(script);
  });
}
