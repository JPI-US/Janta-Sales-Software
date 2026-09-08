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
# Only the src/ modules the server imports at runtime. Keep in sync with
# `grep -rn "\.\./src/" server shared` -- the guard below fails the build if one is missed.
COPY --from=builder /app/src/solarPricing.js ./src/solarPricing.js
COPY --from=builder /app/src/proposalSnapshot.js ./src/proposalSnapshot.js

# Resolve the whole server module graph at build time so a missing runtime file
# fails here instead of crash-looping the container on startup.
RUN node -e "import('./server/apiHandler.js').then(() => console.log('server module graph resolves')).catch((err) => { console.error(err); process.exit(1); })"

EXPOSE 8080

CMD ["node", "server/serve.mjs"]
