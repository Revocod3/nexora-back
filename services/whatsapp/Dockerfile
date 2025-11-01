FROM node:20-alpine AS build
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY . .
RUN apk add --no-cache git \
	&& corepack enable \
	&& pnpm install --no-frozen-lockfile \
	&& pnpm -r --filter @la/connector-whatsapp... build

FROM node:20-alpine
WORKDIR /app
# Copy workspace configuration and package files
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/pnpm-lock.yaml ./
# Copy the service and dependencies
WORKDIR /app/services/connectors/whatsapp
COPY --from=build /app/services/connectors/whatsapp ./
COPY --from=build /app/node_modules /app/node_modules
# Include workspace source dirs for symlinked packages
COPY --from=build /app/shared /app/shared
COPY --from=build /app/packages /app/packages
# Symlink workspace packages used at runtime (avoid full install in runtime image)
RUN mkdir -p /app/services/connectors/whatsapp/node_modules/@la \
	&& ln -s /app/shared/config /app/services/connectors/whatsapp/node_modules/@la/shared-config \
	&& ln -s /app/shared/tracing /app/services/connectors/whatsapp/node_modules/@la/shared-tracing \
	&& ln -s /app/packages/bus /app/services/connectors/whatsapp/node_modules/@la/bus \
	&& ln -s /app/packages/contracts /app/services/connectors/whatsapp/node_modules/@la/contracts \
	&& ln -s /app/shared/logger /app/services/connectors/whatsapp/node_modules/@la/logger
ENV NODE_ENV=production
CMD ["node","dist/services/connectors/whatsapp/src/main.js"]