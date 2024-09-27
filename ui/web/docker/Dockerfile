FROM node:lts-alpine AS builder

# Build dashboard
WORKDIR /usr/builder
COPY . ./
RUN set -ex \
  && corepack enable \
  && corepack prepare pnpm@latest --activate \
  && pnpm set progress=false \
  && pnpm config set depth 0 \
  && pnpm install --ignore-scripts \
  && cp docker/config.json public/config.json \
  && pnpm build

FROM node:lts-alpine

WORKDIR /usr/app
COPY --from=builder /usr/builder ./
COPY docker/run.sh /run.sh
COPY docker/autoconfig.sh /autoconfig.sh
RUN set -ex \
  && chmod +x /run.sh \
  && chmod +x /autoconfig.sh

ENTRYPOINT ["/bin/sh", "-c", "/autoconfig.sh && /run.sh"]
