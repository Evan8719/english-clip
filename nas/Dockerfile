# 备用路径：拿到 Docker 权限后可用（当前部署走用户级进程，见 README.md）
FROM node:22-bookworm-slim

WORKDIR /app
COPY server/ ./server/
COPY web/ ./web/

ENV NODE_ENV=production \
    EC_HOST=0.0.0.0 \
    EC_PORT=4188 \
    EC_DATA_DIR=/data \
    EC_WEB_DIR=/app/web

USER node
EXPOSE 4188
CMD ["node", "server/server.mjs"]
