FROM golang:1.25-alpine AS build

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /ingestion .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=build /ingestion /usr/local/bin/ingestion
COPY --from=build /app/config.yaml /etc/ingestion/config.yaml
ENV CONFIG_PATH=/etc/ingestion/config.yaml
ENTRYPOINT ["ingestion"]
