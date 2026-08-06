FROM docker.io/library/node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM docker.io/library/node:20-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/src/solarPricing.js ./src/solarPricing.js

EXPOSE 8080

CMD ["node", "server/serve.mjs"]
