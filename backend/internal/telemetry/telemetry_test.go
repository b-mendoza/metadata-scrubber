package telemetry

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/posthog/posthog-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	sdklog "go.opentelemetry.io/otel/sdk/log"

	"metadata-scrubber/internal/bindings"
)

func TestCaptureReportsQueueFailureOnlyToLocalLogger(t *testing.T) {
	t.Parallel()
	client := &captureClient{err: errors.New("queue full")}
	var output bytes.Buffer
	events := NewRecorder(client, slog.New(slog.NewJSONHandler(&output, nil)))
	request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", http.NoBody)
	request.Header.Set("X-POSTHOG-DISTINCT-ID", "browser-id")
	bound := bindings.Inject(bindings.Bindings{})(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		events(request.Context(), "file scrubbed")
	}))

	bound.ServeHTTP(httptest.NewRecorder(), request)

	require.Contains(t, output.String(), "could not enqueue PostHog event")
	require.NotContains(t, output.String(), "browser-id")
}

func TestLogFanoutPreservesStdoutAndCapturesOnlyErrorExceptions(t *testing.T) {
	t.Parallel()
	client := &captureClient{}
	exporter := &recordExporter{}
	provider := sdklog.NewLoggerProvider(sdklog.WithProcessor(sdklog.NewSimpleProcessor(exporter)))
	t.Cleanup(func() { assert.NoError(t, provider.Shutdown(context.Background())) })
	var output bytes.Buffer
	logger := slog.New(newLogHandler(slog.NewJSONHandler(&output, nil), client, provider))
	request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", http.NoBody)
	request.Header.Set("X-POSTHOG-DISTINCT-ID", "browser-id")
	request.Header.Set("X-POSTHOG-SESSION-ID", "browser-session")
	bound := bindings.Inject(bindings.Bindings{})(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		logger.DebugContext(request.Context(), "debug record")
		logger.InfoContext(request.Context(), "info record")
		logger.WarnContext(request.Context(), "warning record")
		logger.ErrorContext(request.Context(), "error record", "error", errors.New("safe error"))
	}))

	bound.ServeHTTP(httptest.NewRecorder(), request)
	logger.Error("process error")

	require.NotContains(t, output.String(), "debug record")
	require.Equal(t, 4, bytes.Count(output.Bytes(), []byte("\n")))
	require.Len(t, exporter.records, 5)
	require.Len(t, client.messages, 2)
	exception, ok := client.messages[0].(posthog.Exception)
	require.True(t, ok)
	require.Equal(t, "browser-id", exception.DistinctId)
	require.Equal(t, posthog.Properties{"$process_person_profile": false, "$session_id": "browser-session"}, exception.Properties)
	anonymousException, ok := client.messages[1].(posthog.Exception)
	require.True(t, ok)
	require.Equal(t, "metadata-scrubber-backend", anonymousException.DistinctId)
	require.Equal(t, posthog.Properties{"$process_person_profile": false}, anonymousException.Properties)
}

func TestConfiguredTokenCreatesBothClientsAndClosesEmptyQueues(t *testing.T) {
	t.Parallel()

	runtime, err := New(context.Background(), "phc_synthetic_project_token", slog.New(slog.DiscardHandler))

	require.NoError(t, err)
	require.NotNil(t, runtime.client)
	require.NotNil(t, runtime.logs)
	require.NotNil(t, runtime.Events)
	require.NoError(t, runtime.Shutdown())
}

func TestPostHogCloseCannotExtendShutdownPastContextDeadline(t *testing.T) {
	t.Parallel()
	client := &blockedCloseClient{release: make(chan struct{}), finished: make(chan struct{})}
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	err := closePostHog(ctx, client)

	require.ErrorIs(t, err, context.DeadlineExceeded)
	close(client.release)
	<-client.finished
}

func TestPostHogClosePreservesClientFailure(t *testing.T) {
	t.Parallel()
	closeErr := errors.New("close failed")
	client := &blockedCloseClient{err: closeErr, release: make(chan struct{}), finished: make(chan struct{})}
	close(client.release)

	err := closePostHog(context.Background(), client)

	require.ErrorIs(t, err, closeErr)
	<-client.finished
}

type blockedCloseClient struct {
	posthog.Client
	release  chan struct{}
	finished chan struct{}
	err      error
}

func (client *blockedCloseClient) CloseWithContext(context.Context) error {
	<-client.release
	close(client.finished)
	return client.err
}

type captureClient struct {
	messages []posthog.Message
	err      error
}

func (client *captureClient) Enqueue(message posthog.Message) error {
	client.messages = append(client.messages, message)
	return client.err
}

type recordExporter struct {
	records []sdklog.Record
}

func (exporter *recordExporter) Export(_ context.Context, records []sdklog.Record) error {
	exporter.records = append(exporter.records, records...)
	return nil
}

func (*recordExporter) Shutdown(context.Context) error   { return nil }
func (*recordExporter) ForceFlush(context.Context) error { return nil }
