FROM node:20-alpine

# ffmpeg: CCTV snapshots. eudev-libs: runtime dep of noble's HCI socket binding
# (BLE access for the ThermoPro widget).
RUN apk add --no-cache ffmpeg eudev-libs

WORKDIR /app

COPY package*.json ./

# noble's native bindings (@abandonware/bluetooth-hci-socket) are compiled from
# source on Alpine, so add the build toolchain just for the install then drop it.
RUN apk add --no-cache --virtual .build-deps python3 make g++ linux-headers eudev-dev \
  && npm ci --omit=dev \
  && apk del .build-deps

COPY *.js ./
COPY public/ ./public/

ARG GIT_HASH=unknown
ARG GIT_DATE=unknown
ENV GIT_HASH=$GIT_HASH
ENV GIT_DATE=$GIT_DATE

EXPOSE 3000

CMD ["node", "server.js"]
