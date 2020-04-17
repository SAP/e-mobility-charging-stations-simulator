FROM node:alpine as builder

WORKDIR /usr/builder

COPY package.json package-lock.json ./

RUN npm set progress=false && npm config set depth 0 && npm cache clean --force
RUN npm install

FROM node:alpine

WORKDIR /usr/app

COPY --from=builder /usr/builder/node_modules ./node_modules
COPY NOTICE LICENSE ./
COPY src ./src
COPY *.json ./
COPY docker/config.json ./src/assets/config.json
COPY docker/autoconfig.sh /autoconfig.sh
RUN chmod +x /autoconfig.sh

#CMD ["node", "src/index.js"]
CMD /autoconfig.sh && node src/index.js
