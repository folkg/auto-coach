# Multi-stage build for Bun

# Base stage
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Build stage - install dependencies
FROM base AS builder

# Copy workspace configuration
COPY ../../tsconfig.base.json ./
COPY ../../package.json ./root-package.json

# Copy all workspace sources
COPY ../../common ./common/
COPY ../../server ./server/

# Create minimal package.json with only necessary workspaces and catalog section
RUN apk add --no-cache jq && \
    jq '{name: "auto-coach-container", private: true, type: "module", workspaces: ["server/mutation-api", "server/core", "common"]} + {catalog: .catalog}' root-package.json > package.json

# Install dependencies
RUN bun install --production

# Release stage - minimal runtime image
FROM base AS release
WORKDIR /app

# Copy the entire workspace structure needed at runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder /app/common ./common
COPY --from=builder /app/server/mutation-api ./server/mutation-api
COPY --from=builder /app/server/core ./server/core

# Create non-root user and switch to it
RUN adduser -D -u 1001 appuser
USER appuser

# Expose the port
EXPOSE 3001

# Set environment variable for production
ENV NODE_ENV=production

# Run the application from the correct workspace location
WORKDIR /app/server/mutation-api
ENTRYPOINT ["bun", "run", "src/index.ts"]
