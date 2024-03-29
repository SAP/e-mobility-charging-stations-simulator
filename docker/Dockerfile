FROM node:lts-alpine AS builder

# Build simulator and dashboard
WORKDIR /usr/builder
COPY . ./
RUN set -ex \
  && apk add --no-cache --virtual .gyp build-base python3 \
  && corepack enable \
  && corepack prepare pnpm@latest --activate \
  && pnpm set progress=false \
  && pnpm config set depth 0 \
  && pnpm install --ignore-scripts --frozen-lockfile \
  && cp docker/config.json src/assets/config.json \
  && cp docker/idtags.json src/assets/idtags.json \
  && pnpm build \
  && apk del .gyp \
  && cd ui/web \
  && cp src/assets/config-template.json public/config.json \
  && pnpm build

FROM node:lts-alpine

ARG STACK_TRACE_LIMIT=1024
ARG MAX_OLD_SPACE_SIZE=768

ENV NODE_OPTIONS="--stack-trace-limit=${STACK_TRACE_LIMIT} --max-old-space-size=${MAX_OLD_SPACE_SIZE}"

WORKDIR /usr/app
COPY --from=builder /usr/builder/ui/web ./ui/web
COPY --from=builder /usr/builder/node_modules ./node_modules
COPY --from=builder /usr/builder/dist ./dist
COPY package.json README.md LICENSE ./
COPY docker/start.sh /start.sh
COPY docker/autoconfig.sh /autoconfig.sh
RUN set -ex \
  && chmod +x /start.sh \
  && chmod +x /autoconfig.sh

CMD /autoconfig.sh && /start.sh
