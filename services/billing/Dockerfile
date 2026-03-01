# Stage 1: Build the Go binary
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Cache dependencies
COPY go.mod ./
# Add go.sum later when downloaded, if running `go mod download`
# RUN go mod download

COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o billing-api main.go

# Stage 2: Minimal runtime image
FROM alpine:latest

WORKDIR /root/

COPY --from=builder /app/billing-api .

EXPOSE 3002

CMD ["./billing-api"]
