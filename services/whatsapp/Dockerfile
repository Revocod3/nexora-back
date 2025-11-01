# ========================================
# Build Stage
# ========================================
FROM node:20-alpine AS build
WORKDIR /app

# Install git (needed for some npm packages)
RUN apk add --no-cache git

# Enable corepack for pnpm
RUN corepack enable

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy all packages and services for build
COPY shared ./shared
COPY services ./services

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Build WhatsApp service
RUN pnpm --filter whatsapp build

# ========================================
# Production Stage
# ========================================
FROM node:20-alpine AS production
WORKDIR /app

# Enable corepack
RUN corepack enable

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy built artifacts from build stage
COPY --from=build /app/shared ./shared
COPY --from=build /app/services/whatsapp ./services/whatsapp
COPY --from=build /app/node_modules ./node_modules

# Set working directory to WhatsApp service
WORKDIR /app/services/whatsapp

ENV NODE_ENV=production
EXPOSE 3011

CMD ["node", "dist/main.js"]
