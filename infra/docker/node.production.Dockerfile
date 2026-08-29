FROM node:24-alpine

WORKDIR /app

# Prisma's native engine requires OpenSSL on Alpine images.
RUN apk add --no-cache openssl libc6-compat && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm db:generate && pnpm build

EXPOSE 3000 4000
