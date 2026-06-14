# syntax=docker/dockerfile:1

FROM golang:1.26.4-alpine AS base
WORKDIR /app

FROM base AS dependencies
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

FROM dependencies AS build
COPY . ./
# CGO is disabled so the binary is fully static and can run on scratch.
# -ldflags "-s -w" strips the symbol table and debug info to shrink the binary.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /metadata-scrubber .

# Create an unprivileged user/group to carry over into the final image.
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app

FROM scratch AS runtime
WORKDIR /app
ENV PORT=8080

COPY --from=build /etc/passwd /etc/group /etc/
COPY --from=build --chown=app:app /metadata-scrubber ./metadata-scrubber

USER app
EXPOSE 8080
ENTRYPOINT ["/app/metadata-scrubber"]
