# syntax=docker/dockerfile:1

FROM node:24.16.0-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN corepack enable pnpm

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=s/d70acc78-31f7-4203-bf0d-ec624f6eae40-/pnpm/store,target=/pnpm/store pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . ./
RUN pnpm run build

FROM node:24.16.0-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build --chown=node:node /app/.output ./.output

USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
