# Build stage
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o server ./cmd/server

# Run stage
FROM alpine:3.19
RUN apk add --no-cache ca-certificates curl
COPY --from=builder /app/server /server
COPY sql/migrations /migrations
EXPOSE 8001
ENV MIGRATIONS_PATH=/migrations
CMD ["/server"]
