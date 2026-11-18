FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package configurations
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/mini-app/package.json ./apps/mini-app/
COPY apps/server/package.json ./apps/server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy sources
COPY packages/shared ./packages/shared
COPY apps/mini-app ./apps/mini-app
COPY apps/server ./apps/server

# Generate Prisma client and build
RUN pnpm --filter @bingo/server db:generate
RUN pnpm -r build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/mini-app/package.json ./apps/mini-app/
COPY apps/server/package.json ./apps/server/

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/mini-app/dist ./apps/mini-app/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3001

CMD ["sh", "-c", "pnpm --filter @bingo/server prisma migrate deploy && node apps/server/dist/index.js"]
