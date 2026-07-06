// Package main serves the metadata scrubber HTTP API.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/config"
	"metadata-scrubber/internal/handler"
	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/scrub"
)

const (
	readHeaderTimeout       = 5 * time.Second
	gracefulShutdownTimeout = 10 * time.Second
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	// pdfcpu otherwise tries to create a config dir under $HOME on first use,
	// which panics on a read-only/scratch rootfs. RemoveProperties needs no
	// config, so disable it.
	scrub.DisableConfigDir()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := run(ctx); err != nil {
		logger.Error("metadata-scrubber stopped", "error", err)
		os.Exit(1)
	}
}

// run starts the HTTP server and blocks until it fails or ctx is cancelled, at
// which point it attempts a graceful shutdown. It returns the first error
// encountered, or nil on a clean shutdown.
func run(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	logger := slog.Default()
	server := newServer(cfg, logger)

	serverErr := make(chan error, 1)
	go func() {
		logger.Info("metadata-scrubber listening", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
			return
		}
		serverErr <- nil
	}()

	select {
	case err := <-serverErr:
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), gracefulShutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return err
		}
		return <-serverErr
	}
}

// newServer wires the API routes to their handlers and returns the configured
// server. Request bindings are injected before the routes so handlers read
// validated config from the request context rather than the environment.
func newServer(cfg config.Config, logger *slog.Logger) *http.Server {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", handler.Reachability)
	mux.HandleFunc("POST /api/scrub", handler.Scrub)

	return &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           httpx.RequestLogger(logger)(httpx.CORS(bindings.Inject(bindings.Bindings{Env: cfg})(mux))),
		ReadHeaderTimeout: readHeaderTimeout,
	}
}
