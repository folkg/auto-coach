# Multi-stage build for Bun compiled binary with distroless container
# Optimized for Google Cloud Run cold start performance

# Build stage with Bun
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Copy workspace root files for monorepo support
COPY ../../bun.lockb* ./
COPY ../../tsconfig.base.json ./

# Copy common workspace for shared types
COPY ../../common ./common/

# Copy server workspaces
COPY ../../server ./server/

# Create minimal package.json for container build with only necessary workspaces
RUN printf '{\n  "name": "auto-coach-container",\n  "private": true,\n  "type": "module",\n  "workspaces": [\n    "server/api",\n    "server/core",\n    "server/functions",\n    "common"\n  ]\n}' > package.json

# Install only the dependencies we need
RUN bun install --frozen-lockfile --production

# Build from the API directory with linux target and production flags for compatibility and performance
WORKDIR /app/server/api
RUN bun build src/index.ts --target=bun-linux-x64 --outfile=server --compile --minify --sourcemap --bytecode

# Production stage with distroless for minimal attack surface
FROM gcr.io/distroless/base-debian12:latest
WORKDIR /app

# Create non-root user for security
USER 1001:1001

# Copy only the compiled binary from builder stage
COPY --from=builder --chown=1001:1001 /app/server /app/server

# Expose the port that the application listens on
EXPOSE 3000

# Set environment variable for production
ENV NODE_ENV=production

# Run the compiled binary directly
ENTRYPOINT ["/app/server"]
