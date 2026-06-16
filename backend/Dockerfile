# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89

FROM golang:1.26.4-alpine@sha256:f1ddd9fe14fffc091dd98cb4bfa999f32c5fc77d2f2305ea9f0e2595c5437c14 AS build
WORKDIR /app

COPY go.mod go.sum ./
RUN --mount=type=cache,id=s/d082c335-1252-4a79-bf33-5ce99a51a205-/go/pkg/mod,target=/go/pkg/mod go mod download

COPY . ./
# CGO is disabled so the binary is fully static and can run on scratch.
# -ldflags "-s -w" strips the symbol table and debug info to shrink the binary.
RUN --mount=type=cache,id=s/d082c335-1252-4a79-bf33-5ce99a51a205-/go/pkg/mod,target=/go/pkg/mod \
    --mount=type=cache,id=s/d082c335-1252-4a79-bf33-5ce99a51a205-/root/.cache/go-build,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /metadata-scrubber .

# Create an unprivileged user/group to carry over into the final image.
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app

FROM scratch AS runtime
WORKDIR /app
ENV PORT=8080
# pdfcpu resolves a config dir from $HOME; point it at the writable tmpfs so it
# never tries to mkdir on the read-only rootfs.
ENV HOME=/tmp

COPY --from=build /etc/passwd /etc/group /etc/
COPY --from=build --chown=app:app /metadata-scrubber ./metadata-scrubber

USER app
EXPOSE 8080
ENTRYPOINT ["/app/metadata-scrubber"]
