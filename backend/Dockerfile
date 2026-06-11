# ==========================================
# FLOWOPS AI ENGINE — PRODUCTION DOCKERFILE
# ==========================================

FROM node:20-alpine AS builder

# System packages
RUN apk add --no-cache \
    libc6-compat \
    openssl \
    python3 \
    make \
    g++

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.1.0

# Network hardening for slow African links / VPS
RUN pnpm config set fetch-retries 10
RUN pnpm config set fetch-retry-factor 5
RUN pnpm config set fetch-retry-mintimeout 20000
RUN pnpm config set fetch-retry-maxtimeout 120000
RUN pnpm config set network-timeout 600000

# Copy package manifests first
COPY package.json pnpm-lock.yaml ./

# Prisma schema
COPY prisma ./prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy app source
COPY . .

# Generate Prisma client
RUN pnpm prisma generate

# Build NestJS
RUN pnpm run build

# ==========================================
# PRODUCTION RUNTIME
# ==========================================

FROM node:20-alpine AS runner

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

ENV NODE_ENV=production

# Install pnpm runtime
RUN npm install -g pnpm@9.1.0

# Copy runtime assets
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Uploads volume
RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["node", "dist/main"]
