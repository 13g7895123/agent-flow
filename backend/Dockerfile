FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app
COPY go.mod ./
# 若 go.sum 存在則一併複製，不存在也不中斷 build
COPY go.su[m] ./
# 用 go get 鎖定 go.mod 中指定的版本，補齊 go.sum
RUN go get \
    github.com/gofiber/fiber/v2@v2.52.5 \
    github.com/golang-migrate/migrate/v4@v4.17.1 \
    github.com/golang-migrate/migrate/v4/database/postgres@v4.17.1 \
    github.com/golang-migrate/migrate/v4/source/file@v4.17.1 \
    github.com/google/uuid@v1.6.0 \
    github.com/hibiken/asynq@v0.24.1 \
    github.com/jackc/pgx/v5@v5.6.0 \
    github.com/redis/go-redis/v9@v9.6.1

COPY . .
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# ── Final image ────────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /app/server .
COPY --from=builder /app/internal/migrations ./internal/migrations

EXPOSE 3001
CMD ["./server"]
