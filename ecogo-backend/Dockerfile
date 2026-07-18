FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY db ./db
EXPOSE 3000
# Idempotent init on boot is the single-VPS pilot choice. Run
# dist/scripts/init-db.js as a separate job when moving to managed infrastructure.
CMD ["sh", "-c", "node dist/scripts/init-db.js && exec node dist/src/main.js"]
