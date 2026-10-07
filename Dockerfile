# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS yarn-base

WORKDIR /app

RUN corepack enable \
  && corepack prepare yarn@1.22.22 --activate

COPY package.json yarn.lock ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/sso-cli/package.json ./apps/sso-cli/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY lib/auth/package.json ./lib/auth/package.json
COPY lib/db/package.json ./lib/db/package.json
COPY lib/encryption/package.json ./lib/encryption/package.json
COPY lib/events/package.json ./lib/events/package.json
COPY lib/files/package.json ./lib/files/package.json
COPY lib/kv/package.json ./lib/kv/package.json
COPY lib/pubsub/package.json ./lib/pubsub/package.json
COPY lib/runner/package.json ./lib/runner/package.json
COPY lib/whatsapp/analytics/package.json ./lib/whatsapp/analytics/package.json
COPY lib/whatsapp/components/package.json ./lib/whatsapp/components/package.json
COPY lib/whatsapp/mba/package.json ./lib/whatsapp/mba/package.json
COPY lib/whatsapp/media/package.json ./lib/whatsapp/media/package.json
COPY lib/whatsapp/messaging/package.json ./lib/whatsapp/messaging/package.json
COPY lib/whatsapp/moderation/package.json ./lib/whatsapp/moderation/package.json
COPY lib/whatsapp/flows/package.json ./lib/whatsapp/flows/package.json
COPY lib/whatsapp/marketing/package.json ./lib/whatsapp/marketing/package.json
COPY lib/whatsapp/qr/package.json ./lib/whatsapp/qr/package.json
COPY lib/whatsapp/registration/package.json ./lib/whatsapp/registration/package.json
COPY lib/whatsapp/subscriptions/package.json ./lib/whatsapp/subscriptions/package.json
COPY lib/whatsapp/templates/package.json ./lib/whatsapp/templates/package.json
COPY lib/whatsapp/waba/package.json ./lib/whatsapp/waba/package.json
COPY lib/whatsapp/webhooks/package.json ./lib/whatsapp/webhooks/package.json

FROM yarn-base AS development-dependencies

RUN yarn install --frozen-lockfile

FROM development-dependencies AS build

COPY . .

RUN yarn build

FROM yarn-base AS production-dependencies

RUN yarn install --frozen-lockfile --production=true

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
  NODE_OPTIONS=--no-node-snapshot

WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/ ./
COPY --from=build --chown=node:node /app/apps/api/dist/ ./apps/api/dist/
COPY --from=build --chown=node:node /app/apps/web/dist/ ./apps/web/dist/
COPY --from=build --chown=node:node /app/lib/auth/dist/ ./lib/auth/dist/
COPY --from=build --chown=node:node /app/lib/db/dist/ ./lib/db/dist/
COPY --from=build --chown=node:node /app/lib/db/drizzle/ ./lib/db/drizzle/
COPY --from=build --chown=node:node /app/lib/events/dist/ ./lib/events/dist/
COPY --from=build --chown=node:node /app/lib/files/dist/ ./lib/files/dist/
COPY --from=build --chown=node:node /app/lib/kv/dist/ ./lib/kv/dist/
COPY --from=build --chown=node:node /app/lib/pubsub/dist/ ./lib/pubsub/dist/
COPY --from=build --chown=node:node /app/lib/runner/dist/ ./lib/runner/dist/
COPY --from=build --chown=node:node /app/lib/whatsapp/analytics/dist/ ./lib/whatsapp/analytics/dist/
COPY --from=build --chown=node:node /app/lib/whatsapp/components/dist/ ./lib/whatsapp/components/dist/
COPY --from=build --chown=node:node /app/lib/whatsapp/mba/dist/ ./lib/whatsapp/mba/dist/
COPY --from=build --chown=node:node /app/lib/whatsapp/media/dist/ ./lib/whatsapp/media/dist/
COPY --from=build --chown=node:node /app/lib/whatsapp/messaging/dist/ ./lib/whatsapp/messaging/dist/
COPY --from=build --chown=node:node /app/lib/whatsapp/moderation/dist/ ./lib/whatsapp/moderation/dist/
COPY --from=build --chown=node:node /app/lib/whatsapp/flows/dist/ ./lib/whatsapp/flows/dist/
COPY --from=build --chown=node:node /app/lib/whatsapp/marketing/dist/ ./lib/whatsapp/marketing/dist/
COPY --from=build --chown=node:node /app/lib/whatsapp/qr/dist/ ./lib/whatsapp/qr/dist/
COPY --from=build --chown=node:node /app/lib/whatsapp/registration/dist/ ./lib/whatsapp/registration/dist/
COPY --from=build --chown=node:node /app/lib/whatsapp/subscriptions/dist/ ./lib/whatsapp/subscriptions/dist/
COPY --from=build --chown=node:node /app/lib/whatsapp/templates/dist/ ./lib/whatsapp/templates/dist/
COPY --from=build --chown=node:node /app/lib/whatsapp/waba/dist/ ./lib/whatsapp/waba/dist/
COPY --from=build --chown=node:node /app/lib/whatsapp/webhooks/dist/ ./lib/whatsapp/webhooks/dist/
COPY --chmod=755 docker/mba-desk-backend-entrypoint.sh /usr/local/bin/mba-desk-backend-entrypoint

RUN mkdir -p /var/lib/mba-desk/files /var/data \
  && chown node:node /var/lib/mba-desk/files /var/data

USER node

EXPOSE 8080

STOPSIGNAL SIGTERM

ENTRYPOINT ["mba-desk-backend-entrypoint"]
CMD ["app"]
