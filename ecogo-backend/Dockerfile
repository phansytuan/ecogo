FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
# db:init is idempotent (CREATE ... IF NOT EXISTS); safe to run on every boot.
CMD ["sh", "-c", "npm run db:init && node dist/src/main.js"]
