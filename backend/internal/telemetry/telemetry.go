// Package telemetry connects backend outcomes and slog records to PostHog US Cloud.
package telemetry

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/posthog/posthog-go"
	"go.opentelemetry.io/contrib/bridges/otelslog"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	otellog "go.opentelemetry.io/otel/log"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	"go.opentelemetry.io/otel/sdk/resource"

	"metadata-scrubber/internal/bindings"
)

const (
	// PostHogHost fixes all backend telemetry to US Cloud.
	PostHogHost     = "https://us.i.posthog.com"
	serviceName     = "metadata-scrubber-backend"
	exportTimeout   = 5 * time.Second
	shutdownTimeout = 5 * time.Second
)

// Runtime owns the telemetry clients and their logger.
type Runtime struct {
	Logger *slog.Logger
	Events bindings.WorkflowEvents
	client posthog.Client
	logs   *sdklog.LoggerProvider
}

// New creates PostHog clients with the validated project token.
// It adds telemetry to the local logger.
func New(ctx context.Context, token string, local *slog.Logger) (*Runtime, error) {
	exporter, err := otlploghttp.New(ctx,
		otlploghttp.WithEndpointURL(PostHogHost+"/i/v1/logs"),
		otlploghttp.WithHeaders(map[string]string{"Authorization": "Bearer " + token}),
		otlploghttp.WithTimeout(exportTimeout),
	)
	if err != nil {
		return nil, fmt.Errorf("creating PostHog log exporter: %w", err)
	}
	provider := sdklog.NewLoggerProvider(
		sdklog.WithResource(resource.NewSchemaless(attribute.String("service.name", serviceName))),
		sdklog.WithProcessor(sdklog.NewBatchProcessor(exporter, sdklog.WithExportTimeout(exportTimeout))),
	)
	client, err := posthog.NewWithConfig(token, posthog.Config{
		Endpoint:           PostHogHost,
		BatchUploadTimeout: exportTimeout,
		ShutdownTimeout:    shutdownTimeout,
	})
	if err != nil {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		return nil, errors.Join(fmt.Errorf("creating PostHog client: %w", err), provider.Shutdown(shutdownCtx))
	}
	return &Runtime{
		Logger: slog.New(newLogHandler(local.Handler(), client, provider)),
		Events: NewRecorder(client, local),
		client: client,
		logs:   provider,
	}, nil
}

func newLogHandler(local slog.Handler, client posthog.EnqueueClient, provider otellog.LoggerProvider) slog.Handler {
	return slog.NewMultiHandler(
		local,
		otelslog.NewHandler(serviceName, otelslog.WithLoggerProvider(provider)),
		posthog.NewSlogCaptureHandler(slog.DiscardHandler, client,
			posthog.WithMinCaptureLevel(slog.LevelError),
			posthog.WithDistinctIDFn(func(ctx context.Context, _ slog.Record) string {
				requestBindings, _ := bindings.FromContext(ctx)
				if requestBindings.PostHogDistinctID != "" {
					return requestBindings.PostHogDistinctID
				}
				return serviceName
			}),
			posthog.WithPropertiesFn(func(ctx context.Context, _ slog.Record) posthog.Properties {
				properties := posthog.Properties{"$process_person_profile": false}
				requestBindings, _ := bindings.FromContext(ctx)
				if requestBindings.PostHogSessionID != "" {
					properties["$session_id"] = requestBindings.PostHogSessionID
				}
				return properties
			}),
		),
	)
}

// NewRecorder constructs the workflow-event adapter for a PostHog queue.
func NewRecorder(client posthog.EnqueueClient, local *slog.Logger) bindings.WorkflowEvents {
	return recorder{client: client, logger: local}
}

type recorder struct {
	client posthog.EnqueueClient
	logger *slog.Logger
}

func (events recorder) Capture(event bindings.WorkflowEvent) {
	if event.DistinctID == "" {
		return
	}
	properties := posthog.Properties{"$process_person_profile": false}
	if event.SessionID != "" {
		properties["$session_id"] = event.SessionID
	}
	if err := events.client.Enqueue(posthog.Capture{
		Event:      event.Name,
		DistinctId: event.DistinctID,
		Properties: properties,
	}); err != nil {
		// SDK failures use the local logger so they cannot create more remote telemetry.
		events.logger.Warn("could not enqueue PostHog event", "error", err)
	}
}

// Shutdown flushes and closes each client with its own bounded context.
func (runtime *Runtime) Shutdown() error {
	clientCtx, cancelClient := context.WithTimeout(context.Background(), shutdownTimeout)
	clientErr := closePostHog(clientCtx, runtime.client)
	cancelClient()
	logsCtx, cancelLogs := context.WithTimeout(context.Background(), shutdownTimeout)
	logsErr := runtime.logs.Shutdown(logsCtx)
	cancelLogs()
	return errors.Join(clientErr, logsErr)
}

func closePostHog(ctx context.Context, client posthog.Client) error {
	result := make(chan error, 1)
	// The SDK waits again after cancellation; keep that wait outside the shutdown deadline.
	go func() { result <- client.CloseWithContext(ctx) }()
	select {
	case err := <-result:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}
