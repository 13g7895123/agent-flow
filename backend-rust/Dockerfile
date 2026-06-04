# Build stage
FROM rust:1.82-alpine AS builder

RUN apk add --no-cache musl-dev pkg-config openssl-dev

WORKDIR /app

# Copy Cargo files
COPY Cargo.toml Cargo.lock* ./

# Create a dummy main.rs to cache dependencies
RUN mkdir -p src && \
    echo "fn main() {}" > src/main.rs && \
    echo "fn main() {}" > src/lib.rs

# Build dependencies (this layer will be cached if Cargo.toml hasn't changed)
RUN cargo build --release 2>&1 | grep -v "warning:" || true

# Remove dummy files and copy actual source
RUN rm -rf src

COPY src ./src
COPY migrations ./migrations

# Build the actual application
RUN cargo build --release

# ─────────────────────────────────────────────────────────────
# Runtime stage
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata curl

WORKDIR /app

# Copy the binary from the builder
COPY --from=builder /app/target/release/server .

# Copy migrations
COPY --from=builder /app/migrations ./migrations

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["./server"]
