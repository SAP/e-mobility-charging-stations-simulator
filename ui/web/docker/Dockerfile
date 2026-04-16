FROM node:lts-alpine AS builder

# Build dashboard
WORKDIR /usr/builder
COPY . ./
RUN set -ex \
  && npm install -g --ignore-scripts corepack \
  && corepack enable \
  && corepack prepare pnpm@latest --activate \
  && pnpm set progress=false \
  && pnpm config set depth 0 \
  && pnpm install --ignore-scripts \
  && cp ui/web/docker/config.json ui/web/public/config.json \
  && pnpm --filter webui build

FROM node:lts-alpine

WORKDIR /usr/app
COPY --from=builder /usr/builder/ui/web ./
COPY ui/web/docker/run.sh /run.sh
COPY ui/web/docker/autoconfig.sh /autoconfig.sh
RUN set -ex \
  && chmod +x /run.sh \
  && chmod +x /autoconfig.sh

ENTRYPOINT ["/bin/sh", "-c", "/autoconfig.sh && /run.sh"]
