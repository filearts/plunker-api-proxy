FROM mhart/alpine-node:0.12

WORKDIR /src

COPY package.json ./

RUN apk add --no-cache git make gcc g++ python && \
    npm install && \
    apk del git make gcc g++ python && \
    rm -rf /etc/ssl /usr/share/man /tmp/* /var/cache/apk/* \
        /root/.npm /root/.node-gyp /root/.gnupg

COPY *.js ./
COPY *.json ./
COPY adapters ./adapters

ENV PORT 8080
ENV NODE_ENV production
ENV host plnkr.co

CMD ["node", "server.js"]