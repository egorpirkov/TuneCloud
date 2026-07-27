FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

USER node

COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node . .

EXPOSE 4000

CMD ["node", "src/index.js"]