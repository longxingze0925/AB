# 多阶段构建:依赖 -> 构建 -> 运行
FROM node:20-bookworm-slim AS base
WORKDIR /app

# better-sqlite3 需要编译工具
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
# standalone 产物
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/db ./db
# 原生模块随 standalone 自动包含;若缺失则补带
COPY --from=deps /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

EXPOSE 3000
CMD ["node", "server.js"]
