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
	otellog "go.opentelemetry.io/otel/log"
	sdklog "go.opentelemetry.io/otel/sdk/log"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/logkey"
)

func TestRecorderUsesValidatedAnonymousIdentity(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name       string
		distinctID string
		sessionID  string
		want       []posthog.Message
	}{
		{
			name:       "distinct ID and session",
			distinctID: "browser-id",
			sessionID:  "browser-session",
			want: []posthog.Message{posthog.Capture{
				Event:      "file scrubbed",
				DistinctId: "browser-id",
				Properties: posthog.Properties{"$process_person_profile": false, "$session_id": "browser-session"},
			}},
		},
		{
			name:      "session only",
			sessionID: "browser-session",
		},
		{
			name:       "distinct ID only",
			distinctID: "browser-id",
			want: []posthog.Message{posthog.Capture{
				Event:      "file scrubbed",
				DistinctId: "browser-id",
				Properties: posthog.Properties{"$process_person_profile": false},
			}},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			client := &captureClient{}
			events := NewRecorder(client, slog.New(slog.DiscardHandler))
			request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", http.NoBody)
			if testCase.distinctID != "" {
				request.Header.Set("X-POSTHOG-DISTINCT-ID", testCase.distinctID)
			}
			if testCase.sessionID != "" {
				request.Header.Set("X-POSTHOG-SESSION-ID", testCase.sessionID)
			}
			bound := bindings.Inject(bindings.Bindings{})(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
				events(request.Context(), "file scrubbed")
			}))

			bound.ServeHTTP(httptest.NewRecorder(), request)

			require.Equal(t, testCase.want, client.messages)
		})
	}
}

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
		logger.ErrorContext(request.Context(), "error record", slog.Any(logkey.Error, errors.New("safe error")))
	}))

	bound.ServeHTTP(httptest.NewRecorder(), request)
	logger.Error("process error")

	require.NotContains(t, output.String(), "debug record")
	require.Equal(t, 4, bytes.Count(output.Bytes(), []byte("\n")))
	require.Equal(t, []exportedLogRecord{
		{Body: "debug record", Severity: otellog.SeverityDebug},
		{Body: "info record", Severity: otellog.SeverityInfo},
		{Body: "warning record", Severity: otellog.SeverityWarn},
		{Body: "error record", Severity: otellog.SeverityError},
		{Body: "process error", Severity: otellog.SeverityError},
	}, exporter.records)

	type exceptionRecord struct {
		DistinctID string
		Properties posthog.Properties
	}
	var exceptions []exceptionRecord
	for _, message := range client.messages {
		exception, ok := message.(posthog.Exception)
		require.True(t, ok)
		exceptions = append(exceptions, exceptionRecord{DistinctID: exception.DistinctId, Properties: exception.Properties})
	}
	require.Equal(t, []exceptionRecord{
		{DistinctID: "browser-id", Properties: posthog.Properties{"$process_person_profile": false, "$session_id": "browser-session"}},
		{DistinctID: "metadata-scrubber-backend", Properties: posthog.Properties{"$process_person_profile": false}},
	}, exceptions)
}

func TestConfiguredTokenCreatesBothClientsAndClosesEmptyQueues(t *testing.T) {
	t.Parallel()

	runtime, err := New(context.Background(), "phc_synthetic_project_token", slog.New(slog.DiscardHandler))

	require.NoError(t, err)
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

type exportedLogRecord struct {
	Body     string
	Severity otellog.Severity
}

type recordExporter struct {
	records []exportedLogRecord
}

func (exporter *recordExporter) Export(_ context.Context, records []sdklog.Record) error {
	for index := range records {
		record := &records[index]
		exporter.records = append(exporter.records, exportedLogRecord{Body: record.Body().AsString(), Severity: record.Severity()})
	}
	return nil
}

func (*recordExporter) Shutdown(context.Context) error   { return nil }
func (*recordExporter) ForceFlush(context.Context) error { return nil }
