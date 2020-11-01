FROM node:alpine as builder

WORKDIR /usr/builder

COPY package.json package-lock.json ./

RUN npm set progress=false && npm config set depth 0 && npm cache clean --force
RUN npm install
RUN npm run build

FROM node:alpine

WORKDIR /usr/app

COPY --from=builder /usr/builder/node_modules ./node_modules
COPY NOTICE LICENSE ./
COPY src ./src
COPY dist ./dist
COPY *.json ./
COPY docker/config.json ./src/assets/config.json
COPY docker/autoconfig.sh /autoconfig.sh
RUN chmod +x /autoconfig.sh

#CMD ["node", "src/start.js"]
CMD /autoconfig.sh && node -r source-map-support/register dist/start.js
