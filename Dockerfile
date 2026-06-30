# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# Stage 2: Build the Go binary
FROM golang:1.24-alpine AS backend-builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN CGO_ENABLED=0 GOOS=linux go build -o mlsn-web-checker .

# Stage 3: Minimal runtime image
FROM alpine:3.21

WORKDIR /app

COPY --from=backend-builder /app/mlsn-web-checker .
COPY --from=backend-builder /app/frontend/dist ./frontend/dist
COPY --from=backend-builder /app/start.sh .

RUN chmod +x start.sh

EXPOSE 8000

CMD ["./mlsn-web-checker"]
