FROM node:lts-alpine as builder

RUN apk add --no-cache --virtual .gyp \
  build-base \
  python3

# Build simulator
WORKDIR /usr/builder
COPY .npmrc package.json package-lock.json tsconfig.json rollup.config.mjs prepare.js build-requirements.js ./
COPY src ./src
COPY docker/config.json ./src/assets/config.json
COPY docker/authorization-tags.json ./src/assets/authorization-tags.json
RUN npm set progress=false && npm config set depth 0 && npm cache clean --force && npm install
RUN npm run build

# Build simulator dashboard
WORKDIR /usr/builder/webui
COPY ui/web ./
RUN npm set progress=false && npm config set depth 0 && npm cache clean --force && npm install
RUN npm run build

RUN apk del .gyp

FROM node:lts-alpine

ARG STACK_TRACE_LIMIT
ARG MAX_OLD_SPACE_SIZE

ENV NODE_OPTIONS="--stack-trace-limit=${STACK_TRACE_LIMIT} --max-old-space-size=${MAX_OLD_SPACE_SIZE}"

WORKDIR /usr/app
COPY --from=builder /usr/builder/webui ./webui
COPY --from=builder /usr/builder/node_modules ./node_modules
COPY --from=builder /usr/builder/dist ./dist
COPY README.md LICENSE ./
COPY docker/start.sh /start.sh
COPY docker/autoconfig.sh /autoconfig.sh
RUN chmod +x /start.sh
RUN chmod +x /autoconfig.sh

CMD /autoconfig.sh && /start.sh
