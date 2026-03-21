# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ src/
RUN npx tsc

# Stage 2: Run
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist/ dist/

RUN mkdir -p /data
VOLUME /data
EXPOSE 8410

ENV COORD_PORT=8410
ENV COORD_DB=/data/coord.db

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -sf http://127.0.0.1:8410/health || exit 1

CMD ["node", "dist/index.js"]
