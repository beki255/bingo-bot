FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package configurations
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/mini-app/package.json ./apps/mini-app/
COPY apps/admin-web/package.json ./apps/admin-web/
COPY apps/server/package.json ./apps/server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy sources
COPY packages/shared ./packages/shared
COPY apps/mini-app ./apps/mini-app
COPY apps/admin-web ./apps/admin-web
COPY apps/server ./apps/server

# Generate Prisma client and build
RUN pnpm --filter @bingo/server db:generate
RUN pnpm -r build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy the complete built application from builder
COPY --from=builder /app ./

EXPOSE 3001

CMD ["sh", "-c", "pnpm --filter @bingo/server prisma db push --accept-data-loss && node apps/server/dist/index.js"]
