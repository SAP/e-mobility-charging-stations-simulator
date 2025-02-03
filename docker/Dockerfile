FROM node:lts-alpine AS builder

# Build simulator
WORKDIR /usr/builder
COPY . ./
RUN set -ex \
  && apk add --no-cache --virtual .gyp build-base python3 \
  && npm install -g corepack \
  && corepack enable \
  && corepack prepare pnpm@latest --activate \
  && pnpm set progress=false \
  && pnpm config set depth 0 \
  && pnpm install --ignore-scripts --frozen-lockfile \
  && cp docker/config.json src/assets/config.json \
  && cp docker/idtags.json src/assets/idtags.json \
  && pnpm build \
  && apk del .gyp

FROM node:lts-alpine

ARG STACK_TRACE_LIMIT=1024
ARG MAX_OLD_SPACE_SIZE=768

ENV NODE_OPTIONS="--stack-trace-limit=${STACK_TRACE_LIMIT} --max-old-space-size=${MAX_OLD_SPACE_SIZE}"

WORKDIR /usr/app
COPY --from=builder /usr/builder/node_modules ./node_modules
COPY --from=builder /usr/builder/dist ./dist
COPY package.json README.md LICENSE ./
COPY docker/run.sh /run.sh
COPY docker/autoconfig.sh /autoconfig.sh
RUN set -ex \
  && chmod +x /run.sh \
  && chmod +x /autoconfig.sh

ENTRYPOINT ["/bin/sh", "-c", "/autoconfig.sh && /run.sh"]
