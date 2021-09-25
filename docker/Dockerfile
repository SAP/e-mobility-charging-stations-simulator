FROM node:lts-alpine as builder

WORKDIR /usr/builder

COPY package.json package-lock.json ./

RUN npm set progress=false && npm config set depth 0 && npm cache clean --force
RUN npm install
COPY tsconfig.json rollup.config.js ./
COPY src ./src
COPY docker/config.json ./src/assets/config.json
RUN npm run build

FROM node:lts-alpine

ARG MAX_OLD_SPACE_SIZE

WORKDIR /usr/app

ENV NODE_OPTIONS=--max-old-space-size=${MAX_OLD_SPACE_SIZE}

COPY --from=builder /usr/builder/node_modules ./node_modules
COPY --from=builder /usr/builder/dist ./dist
COPY README.md NOTICE LICENSE ./
COPY docker/autoconfig.sh /autoconfig.sh
RUN chmod +x /autoconfig.sh

#CMD ["node", "dist/start.js"]
CMD /autoconfig.sh && node -r source-map-support/register dist/start.js
