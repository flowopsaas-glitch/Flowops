# FlowOps Driver Portal — multi-stage build (Vite SPA → nginx).
ARG NODE_VERSION=20.18-alpine
ARG NGINX_VERSION=1.27-alpine

# 1. Dependencies
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    (npm ci --no-audit --no-fund || npm install --no-audit --no-fund)

# 2. Build the SPA
FROM node:${NODE_VERSION} AS build
WORKDIR /app
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && test -f dist/index.html

# 3. Runtime — nginx serves the SPA + proxies /api and /socket.io to the API.
FROM nginx:${NGINX_VERSION} AS production
RUN apk add --no-cache gettext curl && rm -rf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html
COPY --chown=nginx:nginx nginx.conf /etc/nginx/templates/default.conf.template
ENV BACKEND_HOST=api \
    BACKEND_PORT=3000 \
    NGINX_PORT=80 \
    NGINX_ENVSUBST_FILTER='^(BACKEND_HOST|BACKEND_PORT|NGINX_PORT)$'
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl --fail --silent --output /dev/null http://127.0.0.1:${NGINX_PORT}/healthz || exit 1
