FROM node:20-alpine AS base

RUN npm install -g pnpm@9.1.0

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./

# dev
FROM base AS development
RUN pnpm install
COPY . .
EXPOSE 5173
CMD ["pnpm", "run", "dev"]

# build
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# prod
FROM nginx:stable-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
