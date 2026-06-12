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

# Compiled app
COPY --from=builder /app/dist ./dist

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Run migrations then start (idempotent in production)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
