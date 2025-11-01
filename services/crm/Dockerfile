FROM node:20-alpine AS build
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile
# Don't build in dev target, let pnpm start:dev handle it

FROM node:20-alpine AS production
WORKDIR /app/services/crm
RUN corepack enable
COPY --from=build /app/services/crm ./
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/shared /app/shared
COPY --from=build /app/packages /app/packages
RUN pnpm -r --filter @la/crm build
ENV NODE_ENV=production
CMD ["node","dist/main.js"]
