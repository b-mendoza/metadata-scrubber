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
	"metadata-scrubber/internal/storage"
)

const (
	readHeaderTimeout       = 5 * time.Second
	gracefulShutdownTimeout = 10 * time.Second
	processingPermitCount   = 2
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	scrub.DisableConfigDir()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := run(ctx); err != nil {
		logger.Error("metadata-scrubber stopped", "error", err)
		os.Exit(1)
	}
}

// run returns the first ready listener result or the result of graceful shutdown after cancellation.
func run(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	logger := slog.Default()
	objectStorage := storage.NewR2(cfg)
	server := newServer(cfg, objectStorage, logger)

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
		return shutdownServer(server, serverErr)
	}
}

func shutdownServer(server *http.Server, waitForServer <-chan error) error {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), gracefulShutdownTimeout)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		return err
	}
	return <-waitForServer
}

func newServer(cfg config.Config, objectStorage storage.Storage, logger *slog.Logger) *http.Server {
	mux := http.NewServeMux()
	workflow := handler.New(logger, make(chan struct{}, processingPermitCount))

	mux.HandleFunc("GET /api/health", handler.Reachability)
	mux.HandleFunc("POST /api/uploads", workflow.Upload)
	mux.HandleFunc("POST /api/files/dry-run", workflow.DryRun)
	mux.HandleFunc("POST /api/files/scrub", workflow.Scrub)

	return &http.Server{
		Addr: fmt.Sprintf(":%d", cfg.Port),
		Handler: httpx.RequestLogger(logger)(httpx.CORS(bindings.Inject(bindings.Bindings{
			Env:     cfg,
			Storage: objectStorage,
		})(mux))),
		ReadHeaderTimeout: readHeaderTimeout,
	}
}
