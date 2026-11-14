# Builds Scaleframes Demo (Screego fork) from source.
FROM node:22-alpine AS ui
WORKDIR /src/ui
COPY ui/package.json ui/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY ui/ ./
RUN yarn build

FROM golang:1.26-alpine AS server
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=ui /src/ui/build ./ui/build
RUN CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=scaleframes" -o /screego .

FROM scratch
COPY --from=server /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=server /screego /screego
USER 1001
ENTRYPOINT ["/screego"]
CMD ["serve"]
