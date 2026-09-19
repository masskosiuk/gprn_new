FROM node:24-alpine

WORKDIR /app

ENV CI=true NEXT_TELEMETRY_DISABLED=1

# Prisma's native engine requires OpenSSL on Alpine images.
RUN apk add --no-cache openssl libc6-compat && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile

# Next.js embeds public URLs into the static pages during the build.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
RUN pnpm db:generate && pnpm build

EXPOSE 3000 4000
