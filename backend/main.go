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

	"go.opentelemetry.io/otel"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/config"
	"metadata-scrubber/internal/handler"
	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
	"metadata-scrubber/internal/telemetry"
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
	err := run(ctx, logger)
	stop()
	if err != nil {
		os.Exit(1)
	}
}

// run constructs clients and closes telemetry after the HTTP server stops.
func run(ctx context.Context, logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		logger.Error("metadata-scrubber stopped", "error", err)
		return err
	}

	// Export failures stay local so a failed export cannot create another exported log.
	otel.SetErrorHandler(otel.ErrorHandlerFunc(func(err error) {
		logger.Warn("could not export PostHog logs", "error", err)
	}))
	runtime, err := telemetry.New(ctx, cfg.PostHogProjectToken, logger)
	if err != nil {
		logger.Error("metadata-scrubber stopped", "error", err)
		return err
	}
	server := newServer(cfg, storage.NewR2(cfg), runtime.Logger, runtime.Events)
	err = runHTTPServer(ctx, server, runtime.Logger)
	if err != nil {
		runtime.Logger.Error("metadata-scrubber stopped", "error", err)
	}
	shutdownErr := runtime.Shutdown()
	if shutdownErr != nil {
		logger.Error("could not close PostHog telemetry", "error", shutdownErr)
	}
	return errors.Join(err, shutdownErr)
}

func runHTTPServer(ctx context.Context, server *http.Server, logger *slog.Logger) error {
	serverErr := make(chan error, 1)
	go serveHTTPServer(server, logger, serverErr)

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

func serveHTTPServer(server *http.Server, logger *slog.Logger, serverErr chan error) {
	logger.Info("metadata-scrubber listening", "addr", server.Addr)
	err := server.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		err = nil
	}
	serverErr <- err
}

func newServer(cfg config.Config, objectStorage storage.Storage, logger *slog.Logger, events bindings.WorkflowEvents) *http.Server {
	mux := http.NewServeMux()
	workflow := handler.New(logger)

	mux.HandleFunc("GET /api/health", workflow.Reachability)
	mux.HandleFunc("GET /api/files/config", workflow.WorkflowConfig)
	mux.HandleFunc("POST /api/uploads", workflow.Upload)
	mux.HandleFunc("POST /api/files/dry-run", workflow.DryRun)
	mux.HandleFunc("POST /api/files/scrub", workflow.Scrub)
	mux.HandleFunc("POST /api/files/download-grant", workflow.DownloadGrant)
	mux.HandleFunc("POST /api/files/delete", workflow.DeleteFlow)

	return &http.Server{
		Addr: fmt.Sprintf(":%d", cfg.Port),
		Handler: bindings.Inject(bindings.Bindings{
			Env:     cfg,
			Storage: objectStorage,
			Events:  events,
		})(httpx.RequestLogger(logger)(httpx.CORS(mux))),
		ReadHeaderTimeout: readHeaderTimeout,
	}
}
