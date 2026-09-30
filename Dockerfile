# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS yarn-base

WORKDIR /app

RUN corepack enable \
  && corepack prepare yarn@1.22.22 --activate

COPY package.json yarn.lock ./
COPY scripts/patch-kafkajs.mjs ./scripts/patch-kafkajs.mjs
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY lib/auth/package.json ./lib/auth/package.json
COPY lib/db/package.json ./lib/db/package.json
COPY lib/events/package.json ./lib/events/package.json
COPY lib/kv/package.json ./lib/kv/package.json
COPY lib/schemas/package.json ./lib/schemas/package.json

FROM yarn-base AS development-dependencies

RUN yarn install --frozen-lockfile

FROM development-dependencies AS build

COPY . .

RUN yarn build

FROM yarn-base AS production-dependencies

RUN yarn install --frozen-lockfile --production=true

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/ ./
COPY --from=build --chown=node:node /app/apps/api/dist/ ./apps/api/dist/
COPY --from=build --chown=node:node /app/apps/web/dist/ ./apps/web/dist/
COPY --from=build --chown=node:node /app/lib/auth/dist/ ./lib/auth/dist/
COPY --from=build --chown=node:node /app/lib/db/dist/ ./lib/db/dist/
COPY --from=build --chown=node:node /app/lib/db/drizzle/ ./lib/db/drizzle/
COPY --from=build --chown=node:node /app/lib/events/dist/ ./lib/events/dist/
COPY --from=build --chown=node:node /app/lib/kv/dist/ ./lib/kv/dist/
COPY --chmod=755 docker/mba-demo-backend-entrypoint.sh /usr/local/bin/mba-demo-backend-entrypoint

USER node

EXPOSE 8080

STOPSIGNAL SIGTERM

ENTRYPOINT ["mba-demo-backend-entrypoint"]
