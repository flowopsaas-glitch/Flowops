# ── Stage 1: builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (layer cache)
COPY package*.json ./
RUN npm ci --only=production=false

# Copy source
COPY tsconfig*.json ./
COPY .nestclirc ./
COPY src ./src
COPY prisma ./prisma

# Generate Prisma client + build
RUN npx prisma generate
RUN npm run build

# ── Stage 2: production image ─────────────────────────────────────────────
FROM node:20-alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /app

# Only production deps
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Prisma schema + generated client (required at runtime)
COPY --from=builder /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma /app/node_modules/@prisma
COPY prisma ./prisma

# Prisma CLI — lives in devDeps so it's not installed above; copy it from
# the builder stage so we can run `prisma db push` at startup.
# This repo uses db push (no migrations folder), so migrate deploy would fail.
COPY --from=builder /app/node_modules/prisma /app/node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma /app/node_modules/.bin/prisma

# Compiled app
COPY --from=builder /app/dist ./dist

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Sync schema then start. db push is idempotent — safe to run on every start.
# --skip-generate: client was already generated in the builder stage.
# --accept-data-loss: required flag for db push in non-interactive mode.
CMD ["sh", "-c", "./node_modules/.bin/prisma db push --skip-generate --accept-data-loss && node dist/main"]
