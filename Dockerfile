# Stage 1: Build the Go binary
FROM golang:1.26-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o mlsn-web-checker .

# Stage 2: Minimal runtime image
FROM alpine:3.19

WORKDIR /app

COPY --from=builder /app/mlsn-web-checker .
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/static ./static
COPY --from=builder /app/data ./data
COPY --from=builder /app/start.sh .

RUN chmod +x start.sh

EXPOSE 8000

CMD ["./mlsn-web-checker"]
