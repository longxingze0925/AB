# 多阶段构建:依赖 -> 构建 -> 运行
FROM node:20-bookworm-slim AS base
WORKDIR /app

# better-sqlite3 需要编译工具
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production

# 复制运行时依赖
COPY --from=deps /app/node_modules ./node_modules
# 复制构建产物
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/db ./db
COPY --from=builder /app/package.json ./package.json

# 创建数据目录
RUN mkdir -p /data && chmod 755 /data

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["npm", "start"]
