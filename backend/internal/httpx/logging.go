package httpx

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

// RequestLogger logs the start and completion of every HTTP request without
// logging request or response bodies.
func RequestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	if logger == nil {
		logger = slog.Default()
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			started := time.Now()
			path := r.URL.Path

			logRequestStarted(logger, r, path)

			recorder := newLoggingResponseWriter(w)
			defer func() {
				if recovered := recover(); recovered != nil {
					recorder.recordPanicStatus()

					logRequestCompleted(
						logger,
						r,
						path,
						recorder,
						started,
						slog.LevelError,
						slog.Bool("panicked", true),
						slog.String("panic", fmt.Sprint(recovered)),
					)
					panic(recovered)
				}

				logRequestCompleted(logger, r, path, recorder, started, slog.LevelInfo)
			}()

			next.ServeHTTP(recorder, r)
		})
	}
}

func logRequestStarted(logger *slog.Logger, r *http.Request, path string) {
	logger.LogAttrs(
		r.Context(),
		slog.LevelInfo,
		"request started",
		slog.String("method", r.Method),
		slog.String("path", path),
		slog.String("remote_addr", r.RemoteAddr),
		slog.String("user_agent", r.UserAgent()),
	)
}

func logRequestCompleted(
	logger *slog.Logger,
	r *http.Request,
	path string,
	recorder *loggingResponseWriter,
	started time.Time,
	level slog.Level,
	extraAttrs ...slog.Attr,
) {
	attrs := requestCompletionLogAttrs(r, path, recorder, started)
	attrs = append(attrs, extraAttrs...)

	logger.LogAttrs(
		r.Context(),
		level,
		"request completed",
		attrs...,
	)
}

func requestCompletionLogAttrs(
	r *http.Request,
	path string,
	recorder *loggingResponseWriter,
	started time.Time,
) []slog.Attr {
	return []slog.Attr{
		slog.String("method", r.Method),
		slog.String("path", path),
		slog.Int("status", recorder.status),
		slog.Int("bytes", recorder.bytes),
		slog.Int64("duration_ms", time.Since(started).Milliseconds()),
	}
}

type loggingResponseWriter struct {
	http.ResponseWriter
	bytes       int
	status      int
	wroteHeader bool
}

func newLoggingResponseWriter(responseWriter http.ResponseWriter) *loggingResponseWriter {
	return &loggingResponseWriter{
		ResponseWriter: responseWriter,
		status:         http.StatusOK,
	}
}

func (w *loggingResponseWriter) Write(bytes []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}

	n, err := w.ResponseWriter.Write(bytes)
	w.bytes += n

	return n, err
}

func (w *loggingResponseWriter) WriteHeader(statusCode int) {
	if w.wroteHeader {
		return
	}

	w.status = statusCode
	w.wroteHeader = true
	w.ResponseWriter.WriteHeader(statusCode)
}

func (w *loggingResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func (w *loggingResponseWriter) recordPanicStatus() {
	if !w.wroteHeader {
		w.status = http.StatusInternalServerError
	}
}
