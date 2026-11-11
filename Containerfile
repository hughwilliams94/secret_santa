FROM docker.io/library/node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_FILE=/data/db.json

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
COPY lib ./lib
COPY public ./public

# /data is owned by the unprivileged "node" user; Podman copies this
# ownership into the named volume the first time it is mounted.
RUN mkdir /data && chown node:node /data
USER node

EXPOSE 3000
CMD ["node", "server.js"]
