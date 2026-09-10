# syntax=docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32

FROM golang:1.27.1-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125 AS build
WORKDIR /app

COPY go.mod go.sum ./
RUN --mount=type=cache,id=go-mod,target=/go/pkg/mod go mod download

COPY . ./
# CGO is disabled so the binary is fully static and can run on distroless static.
# -ldflags "-s -w" strips the symbol table and debug info to shrink the binary.
RUN --mount=type=cache,id=go-mod,target=/go/pkg/mod \
    --mount=type=cache,id=go-build,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /metadata-scrubber .

FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab AS runtime
WORKDIR /app
# PORT is intentionally not pinned here: Vercel injects the port its router
# forwards to, and the app defaults to 8080 (see internal/config) for local
# docker-compose/pnpm runs.
# pdfcpu resolves a config dir from $HOME; point it at the writable tmpfs so it
# never tries to mkdir on the read-only rootfs.
ENV HOME=/tmp

COPY --from=build /metadata-scrubber ./metadata-scrubber

EXPOSE 8080
ENTRYPOINT ["./metadata-scrubber"]
