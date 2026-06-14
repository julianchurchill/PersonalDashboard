FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY *.js ./
COPY public/ ./public/

ARG GIT_HASH=unknown
ARG GIT_DATE=unknown
ENV GIT_HASH=$GIT_HASH
ENV GIT_DATE=$GIT_DATE

EXPOSE 3000

CMD ["node", "server.js"]
