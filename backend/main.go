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
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)
	scrub.DisableConfigDir()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	if err := run(ctx); err != nil {
		stop()
		logger.Error("metadata-scrubber stopped", "error", err)
		os.Exit(1)
	}
	stop()
}

// run returns the first ready listener result or the result of graceful shutdown after cancellation.
func run(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	logger := slog.Default()
	server := newServer(cfg, storage.NewR2(cfg), logger)

	serverErr := make(chan error, 1)
	go func() {
		logger.Info("metadata-scrubber listening", "addr", server.Addr)
		err := server.ListenAndServe()
		if errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
		serverErr <- err
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

func newServer(cfg config.Config, objectStorage storage.Storage, logger *slog.Logger) *http.Server {
	mux := http.NewServeMux()
	workflow := handler.New(logger, make(chan struct{}, handler.ProcessingPermitCount))

	mux.HandleFunc("GET /api/health", workflow.Reachability)
	mux.HandleFunc("GET /api/files/config", workflow.WorkflowConfig)
	mux.HandleFunc("POST /api/uploads", workflow.Upload)
	mux.HandleFunc("POST /api/files/dry-run", workflow.DryRun)
	mux.HandleFunc("POST /api/files/scrub", workflow.Scrub)
	mux.HandleFunc("POST /api/files/download-grant", workflow.DownloadGrant)
	mux.HandleFunc("POST /api/files/delete", workflow.DeleteFlow)

	return &http.Server{
		Addr: fmt.Sprintf(":%d", cfg.Port),
		Handler: httpx.RequestLogger(logger)(httpx.CORS(bindings.Inject(bindings.Bindings{
			Env:     cfg,
			Storage: objectStorage,
		})(mux))),
		ReadHeaderTimeout: readHeaderTimeout,
	}
}
