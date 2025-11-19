# syntax=docker/dockerfile:1.7
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=80 \
    DATA_DIR=/data

# tini + wget для healthcheck
RUN apk add --no-cache tini wget && mkdir -p /data

# Устанавливаем deps
COPY package*.json ./
RUN npm ci --omit=dev || npm i --omit=dev

# Кладём приложение
COPY . .

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini","--"]
CMD ["npm","start"]
