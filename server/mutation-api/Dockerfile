# Multi-stage build for Bun with workspace support
# Runs TypeScript directly with Bun runtime

FROM oven/bun:1-alpine AS base
WORKDIR /app

# Build stage - install production dependencies with workspace support
FROM base AS builder

# Copy workspace configuration
COPY tsconfig.base.json ./
COPY package.json ./root-package.json

# Copy workspace sources (needed for workspace resolution)
COPY common ./common/
COPY server/core ./server/core/
COPY server/mutation-api ./server/mutation-api/

# Create minimal package.json with only necessary workspaces and catalog
RUN apk add --no-cache jq && \
    jq '{name: "auto-coach-container", private: true, type: "module", workspaces: ["server/mutation-api", "server/core", "common"]} + {catalog: .catalog}' root-package.json > package.json

# Install production dependencies
RUN bun install --production

# Release stage - minimal runtime image
FROM base AS release
WORKDIR /app

# Copy installed node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy workspace sources
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder /app/common ./common
COPY --from=builder /app/server/mutation-api ./server/mutation-api
COPY --from=builder /app/server/core ./server/core

# Create non-root user and switch to it
RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

# Set working directory to mutation-api
WORKDIR /app/server/mutation-api

# Expose the port
EXPOSE 3001

# Set environment variable for production
ENV NODE_ENV=production

# Run TypeScript directly with Bun
ENTRYPOINT ["bun", "run", "src/index.ts"]
