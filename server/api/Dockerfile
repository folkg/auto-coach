# Multi-stage build for Bun

# Base stage
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Build stage - install and build everything
FROM base AS builder

# Copy workspace configuration
COPY ../../tsconfig.base.json ./
COPY ../../package.json ./root-package.json

# Copy all workspace sources
COPY ../../common ./common/
COPY ../../server ./server/

# Create minimal package.json with only necessary workspaces and catalog section
RUN apk add --no-cache jq && \
    jq '{name: "auto-coach-container", private: true, type: "module", workspaces: ["server/api", "server/core", "common"]} + {catalog: .catalog}' root-package.json > package.json

# Install dependencies
RUN bun install --production

# Build the API
WORKDIR /app/server/api
RUN bun build src/index.ts --target=bun --outfile=dist/index.js

# Release stage - minimal runtime image
FROM base AS release
WORKDIR /app

# Copy production dependencies and built application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/api/dist ./dist

# Create non-root user and switch to it
RUN adduser -D -u 1001 appuser
USER appuser

# Expose the port
EXPOSE 3000

# Set environment variable for production
ENV NODE_ENV=production

# Run the application
ENTRYPOINT ["bun", "run", "dist/index.js"]
