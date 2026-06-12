# syntax=docker/dockerfile:1.7
#
# FlowOps frontend — multi-stage build.
#
# Stages:
#   deps         Install npm dependencies once with cache mount.
#   build        Vite production build with build-time env injection.
#   production   nginx:alpine + the SPA bundle. Runtime envsubst on
#                /etc/nginx/templates/default.conf.template renders the
#                upstream from BACKEND_HOST / BACKEND_PORT at container start.
#   development  Local Vite dev server, opt-in via `--target development`.
#
# Build args (passed via `docker build --build-arg KEY=value` or compose `args:`):
#   VITE_API_URL                       Backend API base URL. Baked into the bundle.
#                                      Default `/api` (assumes the SPA is served
#                                      from the same host that proxies the API).
#   VITE_APP_ENV                       development | staging | production.
#   VITE_APP_VERSION                   Semver. Surfaced in Sentry / OTel.
#   VITE_SENTRY_DSN                    Optional. Empty disables Sentry.
#   VITE_OLLAMA_URL                    Optional. Local LLM dev panel.
#   VITE_OTEL_EXPORTER_OTLP_ENDPOINT   OTel collector URL.
#
# Runtime env (production stage; substituted into nginx config at start):
#   BACKEND_HOST   Internal hostname of the API service. Default: api
#   BACKEND_PORT   API port. Default: 3000
#   NGINX_PORT     Listen port. Default: 80
#
# The runtime image is intentionally pinned to digest-aware tags upstream so
# subsequent rebuilds don't drift. Bump `NODE_VERSION` / `NGINX_VERSION` here
# when upgrading rather than chasing `:alpine`.

ARG NODE_VERSION=20.18-alpine
ARG NGINX_VERSION=1.27-alpine

# ─────────────────────────────────────────────────────────────────────────
# 1. Dependency install — cached across source-only edits.
# ─────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps

WORKDIR /app

# Copy only the lockfile + manifest first so this layer caches across source
# edits. The lockfile is tracked in this repo (root .gitignore was patched in
# PR #2 to stop ignoring it).
COPY package.json package-lock.json ./

# BuildKit cache mount → repeated builds reuse npm's content-addressable cache.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ─────────────────────────────────────────────────────────────────────────
# 2. Build — compiles the SPA. Build-time env vars get baked into the bundle.
# ─────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS build

WORKDIR /app

ARG VITE_API_URL=/api
ARG VITE_APP_ENV=production
ARG VITE_APP_VERSION=0.0.0
ARG VITE_SENTRY_DSN=
ARG VITE_OLLAMA_URL=
ARG VITE_OTEL_EXPORTER_OTLP_ENDPOINT=

ENV VITE_API_URL=$VITE_API_URL \
    VITE_APP_ENV=$VITE_APP_ENV \
    VITE_APP_VERSION=$VITE_APP_VERSION \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_OLLAMA_URL=$VITE_OLLAMA_URL \
    VITE_OTEL_EXPORTER_OTLP_ENDPOINT=$VITE_OTEL_EXPORTER_OTLP_ENDPOINT

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build && \
    test -f dist/index.html  # fail loudly if the build produced no index

# ─────────────────────────────────────────────────────────────────────────
# 3. Production runtime — nginx serves the SPA + proxies /api and /socket.io.
# ─────────────────────────────────────────────────────────────────────────
FROM nginx:${NGINX_VERSION} AS production

# `gettext` ships envsubst, which the nginx alpine entrypoint uses to render
# /etc/nginx/templates/*.template at start. `curl` is for HEALTHCHECK.
RUN apk add --no-cache gettext curl && \
    rm -rf /etc/nginx/conf.d/default.conf

# Static SPA bundle.
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

# nginx alpine auto-renders templates at start. We whitelist exactly the env
# vars to substitute so `$proxy_add_x_forwarded_for` etc. inside the config
# are left as nginx variables instead of being clobbered.
COPY --chown=nginx:nginx nginx.conf /etc/nginx/templates/default.conf.template

ENV BACKEND_HOST=api \
    BACKEND_PORT=3000 \
    NGINX_PORT=80 \
    NGINX_ENVSUBST_FILTER='^(BACKEND_HOST|BACKEND_PORT|NGINX_PORT)$'

EXPOSE 80

# nginx image's default ENTRYPOINT chain runs envsubst-on-templates and then
# execs `nginx -g 'daemon off;'`. Don't override it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl --fail --silent --show-error --output /dev/null http://127.0.0.1:${NGINX_PORT}/healthz || exit 1

# ─────────────────────────────────────────────────────────────────────────
# 4. Development — local Vite dev server. Opt-in via `--target development`
#    or compose `target: development`. Not used in production builds.
# ─────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS development

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 5173

# `--host 0.0.0.0` so the port is reachable from outside the container.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
