# Stage 1: Build the Go binary
FROM golang:1.21-bookworm AS builder

WORKDIR /app

# Cache dependencies
COPY go.mod ./

COPY . .

# Download dependencies and generate go.sum
RUN go mod tidy

# Build the binary with CGO and explicit debug symbols
ENV CGO_ENABLED=1
RUN GOOS=linux go build -o billing-api main.go


# Stage 2: Minimal runtime image compatible with OneAgent
FROM debian:bookworm-slim

WORKDIR /root/

COPY --from=builder /app/billing-api .

EXPOSE 3002

CMD ["./billing-api"]
