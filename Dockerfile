# windband-inventory — SPA build + serve.
#
# Railway / Docker provider: this file is auto-detected at the repo root, so a
# push to GitHub that Railway watches builds and deploys without extra config.
#
# 2026-10-13 (prod 502 repair):
#   A stale custom-domain routing on a *stopped* previous service produced
#   `x-railway-fallback: true` → 502 "Application failed to respond" while the
#   freshly deployed image ran fine locally (Docker + same env vars). Two
#   safeguards added here, both zero-code-cost and fully idempotent in local dev,
#   docker compose and Railway:
#     * HEALTHCHECK — proves the image actually serves HTTP before we report OK.
#     * No implicit `EXPOSE` drift: explicit `listen 0.0.0.0:80` lives in
#       deploy/nginx/default.conf.template so a future nginx upgrade that moves
#       the default socket cannot silently regress production.
#
# Contract with the browser (same as `vite dev` locally): the SPA talks to
# windband-manager through SAME-ORIGIN `/api/v1/...`. nginx here proxies those
# calls to WM; only the target differs by environment:
#   - local `docker run`:           WM_API_URL=http://localhost:8080 (default)
#   - Railway (inventory service):  WM_API_URL=https://<windband-manager-slug>.up.railway.app
#
# The nginx official image renders /etc/nginx/templates/*.template via envsubst
# at container start (deploy/nginx/default.conf.template + env.js.template), so
# ALL runtime values are ORDINARY ENVIRONMENT VARIABLES — one identical image in
# every environment; production only overrides them, no rebuild, no code change:
#   AUTH_ISSUER      -> https://login.bandmanager.pl/realms/windband (realm URL)
#   AUTH_CLIENT_ID   -> windband-inventory   (canonical name; default already this)
#   WM_API_URL       -> http://windband-manager.railway.internal:8080
# The SPA callback redirect is always <served origin>/callback; each environment's
# origin must be on the client's Valid redirect URIs in Keycloak.

FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ .
RUN npm run build

FROM nginx:1.27-alpine
# Defaults = local docker run; providers (Railway) override per environment.
ENV WM_API_URL=http://localhost:8080
ENV AUTH_ISSUER=http://localhost:8180/realms/windband
ENV AUTH_CLIENT_ID=windband-inventory
# Docker built-in DNS (user-defined networks, Railway internal DNS). When the
# container runs with --network host, override to your host's resolver.
ENV NGINX_RESOLVER=127.0.0.11
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/nginx/env.js.template /etc/nginx/templates/env.js.template
COPY --from=build /app/dist/ /usr/share/nginx/html/
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
