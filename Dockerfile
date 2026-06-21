FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY deploy/ /app/deploy/
COPY --from=frontend-builder /app/frontend/dist /app/deploy/web_admin/frontend_dist

ENV FOURG_WIFI_ADMIN_HOST=0.0.0.0
ENV FOURG_WIFI_ADMIN_PORT=8080
ENV FOURG_WIFI_ADMIN_STATIC_DIR=/app/deploy/web_admin/frontend_dist

EXPOSE 8080

CMD ["python3", "/app/deploy/web_admin/linkhive_admin.py"]
