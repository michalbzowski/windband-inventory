# windband-inventory — SPA build + serve.
#
# Railway / Docker provider: this file is auto-detected at the repo root, so a
# push to GitHub that Railway watches builds and deploys without extra config.
#
# Contract with the browser (same as `vite dev` locally): the SPA talks to
# windband-manager through SAME-ORIGIN `/api/v1/...`. nginx here proxies those
# calls to WM; only the target differs by environment:
#   - local `docker run`:           WM_API_URL=http://localhost:8080 (default)
#   - Railway (inventory service):  WM_API_URL=https://<windband-manager-slug>.up.railway.app
#
# The nginx official image renders /etc/nginx/templates/*.template via envsubst
# at container start (see deploy/nginx/default.conf.template), so WM_API_URL is
# an ordinary environment variable — no rebuild needed when it changes.

FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ .
RUN npm run build

FROM nginx:1.27-alpine
ENV WM_API_URL=http://localhost:8080
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/ /usr/share/nginx/html/
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
