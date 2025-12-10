# Multi-stage build for Bun with external packages
# Bundles code but keeps node_modules for packages with dynamic file loading

FROM oven/bun:1-alpine AS base
WORKDIR /app

# Build stage - install production dependencies
FROM base AS builder

# Copy workspace configuration
COPY tsconfig.base.json ./
COPY package.json ./root-package.json

# Copy workspace sources
COPY common ./common/
COPY server/core ./server/core/
COPY server/mutation-api ./server/mutation-api/

# Create minimal package.json with only necessary workspaces
RUN apk add --no-cache jq && \
    jq '{name: "auto-coach-container", private: true, type: "module", workspaces: ["server/mutation-api", "server/core", "common"]} + {catalog: .catalog}' root-package.json > package.json

# Install production dependencies only
RUN bun install --production

# Release stage - minimal runtime image
FROM base AS release
WORKDIR /app

# Copy node_modules (needed for @google-cloud/tasks dynamic file loading)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy pre-built bundle from host
COPY server/mutation-api/dist/index.js ./dist/index.js

# Create non-root user and switch to it
RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

# Expose the port
EXPOSE 3001

# Set environment variable for production
ENV NODE_ENV=production

# Run the bundled application with Bun
ENTRYPOINT ["bun", "run", "dist/index.js"]
