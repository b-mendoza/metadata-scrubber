# syntax=docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32

FROM golang:1.26.6-alpine@sha256:3889b425f035be855a72fb4755265311293b6d414521f0a519d819df32222d83 AS build
WORKDIR /app

COPY go.mod go.sum ./
RUN --mount=type=cache,id=go-mod,target=/go/pkg/mod go mod download

COPY . ./
# CGO is disabled so the binary is fully static and can run on scratch.
# -ldflags "-s -w" strips the symbol table and debug info to shrink the binary.
RUN --mount=type=cache,id=go-mod,target=/go/pkg/mod \
    --mount=type=cache,id=go-build,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /metadata-scrubber .

# Create an unprivileged user/group to carry over into the final image.
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app

FROM scratch AS runtime
WORKDIR /app
# PORT is intentionally not pinned here: Vercel injects the port its router
# forwards to, and the app defaults to 8080 (see internal/config) for local
# docker-compose/pnpm runs.
# pdfcpu resolves a config dir from $HOME; point it at the writable tmpfs so it
# never tries to mkdir on the read-only rootfs.
ENV HOME=/tmp

COPY --from=build /etc/passwd /etc/group /etc/
COPY --from=build --chown=app:app /metadata-scrubber ./metadata-scrubber

USER app
EXPOSE 8080
ENTRYPOINT ["/app/metadata-scrubber"]
