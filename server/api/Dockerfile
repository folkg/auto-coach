# Minimal container for pre-compiled Bun binary
# Binary is built externally with: bun build src/index.ts --target=bun-linux-x64 --outfile=dist/server --compile

FROM debian:bookworm-slim AS release

# Install minimal runtime dependencies for Bun compiled binary
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy pre-built binary from host
COPY server/api/dist/server ./server

# Create non-root user and switch to it
RUN useradd -r -u 1001 appuser && chown appuser:appuser /app/server
USER appuser

# Expose the port
EXPOSE 3000

# Set environment variable for production
ENV NODE_ENV=production

# Run the compiled binary directly
ENTRYPOINT ["./server"]
