FROM node:4

WORKDIR /src

COPY package.json ./

RUN npm install --production && \
    npm cache clean --force

COPY *.js ./
COPY *.json ./
COPY adapters ./adapters

ENV PORT 8080
ENV NODE_ENV production
ENV host plnkr.co

CMD ["node", "server.js"]
