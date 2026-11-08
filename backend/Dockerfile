# ── Stage 1: builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Native addons (bcrypt is the one we ship) normally install a prebuilt binary
# downloaded from GitHub releases. When that CDN is unavailable it returns 504
# and node-pre-gyp falls back to compiling from source — which needs a
# toolchain. Without this, a third-party CDN outage breaks the build.
RUN apk add --no-cache python3 make g++ linux-headers openssl

WORKDIR /app

# Install deps first (layer cache)
# `--only=production=false` was never a valid npm flag; npm warned and ignored
# it. `npm ci` is the unambiguous way to say "everything, dev deps included".
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig*.json ./
COPY .nestclirc ./
COPY src ./src
COPY prisma ./prisma

# Generate Prisma client + build
# Increase Node.js heap for the NestJS TypeScript compilation on memory-constrained hosts (2GB VPS).
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npx prisma generate
RUN npm run build

# ── Stage 2: production image ─────────────────────────────────────────────
FROM node:20-alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /app

# OpenSSL is required by the Prisma query-engine binary at runtime.
# Without it, Prisma prints "failed to detect libssl" and refuses to start.
# libstdc++ is needed at runtime by native addons compiled from source in this
# stage, so it is installed permanently and excluded from the toolchain below.
RUN apk add --no-cache openssl libstdc++

# Only production deps. npm is needed to install the runtime tree, but it is
# not needed by the compiled NestJS process or the Prisma CLI at runtime.
# Remove the bundled npm tree afterwards so its stale transitive tar package
# cannot become part of the production image's attack surface.
#
# The build toolchain is added as a virtual package and deleted in the SAME
# layer so it never ships in the image. bcrypt's prebuilt binary is fetched
# from a third-party CDN; when that returns 504 node-pre-gyp compiles from
# source instead, and without a toolchain here the install dies. A third-party
# outage should not be able to break a release build. See the builder stage.
COPY package*.json ./
RUN apk add --no-cache --virtual .gyp-deps python3 make g++ linux-headers \
 && npm ci --only=production \
 && apk del .gyp-deps \
 && npm cache clean --force \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Prisma schema + generated client + ALL engine binaries
COPY --from=builder /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma /app/node_modules/@prisma
COPY prisma ./prisma

# Prisma CLI is used for image-build client generation and explicit isolated
# CI fixture setup only. The application startup command never invokes it.
# Adoption/migration of existing data requires a separately approved operator job.
COPY --from=builder /app/node_modules/prisma /app/node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma /app/node_modules/.bin/prisma

# Compiled app
COPY --from=builder /app/dist ./dist

# Non-root user — create BEFORE chown so the user exists
RUN addgroup -g 1001 -S nodejs \
 && adduser -S nestjs -u 1001

# Regenerate Prisma client inside the production container so the engine
# binary matches the installed OpenSSL version (linux-musl + openssl3).
# The builder's binary may be for a different platform/openssl combo.
RUN ./node_modules/.bin/prisma generate \
 && chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start the application only. Never mutate schema on boot/restart/rollback.
# An empty or incompatible database is a deployment prerequisite failure, not
# permission to run db push, migrate dev, or baseline resolution automatically.
CMD ["node", "dist/main"]
