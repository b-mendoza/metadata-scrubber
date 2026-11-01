package httpx

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"metadata-scrubber/internal/logkey"
)

// RequestLogger logs the start and completion of every HTTP request without
// logging request or response bodies.
func RequestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			startedAt := time.Now()
			path := r.URL.Path
			logger.LogAttrs(
				r.Context(),
				slog.LevelInfo,
				"request started",
				slog.String(logkey.Method, r.Method),
				slog.String(logkey.Path, path),
				slog.String(logkey.RemoteAddr, r.RemoteAddr),
				slog.String(logkey.UserAgent, r.UserAgent()),
			)

			recorder := &loggingResponseWriter{ResponseWriter: w, status: http.StatusOK}
			defer logRequestCompletion(logger, requestLogRequest{method: r.Method, path: path, context: r.Context()}, recorder, startedAt)
			next.ServeHTTP(recorder, r)
		})
	}
}

type requestLogRequest struct {
	method  string
	path    string
	context context.Context
}

func logRequestCompletion(logger *slog.Logger, request requestLogRequest, recorder *loggingResponseWriter, startedAt time.Time) {
	recovered := recover()
	level := slog.LevelInfo
	if recovered != nil {
		if !recorder.wroteHeader {
			recorder.status = http.StatusInternalServerError
		}
		level = slog.LevelError
	}

	attrs := []slog.Attr{
		slog.String(logkey.Method, request.method),
		slog.String(logkey.Path, request.path),
		slog.Int(logkey.Status, recorder.status),
		slog.Int(logkey.Bytes, recorder.bytesWritten),
		slog.Int64(logkey.DurationMS, time.Since(startedAt).Milliseconds()),
	}
	if recovered != nil {
		attrs = append(attrs, slog.Bool(logkey.Panicked, true))
	}
	logger.LogAttrs(request.context, level, "request completed", attrs...)
	if recovered != nil {
		panic(recovered)
	}
}

type loggingResponseWriter struct {
	http.ResponseWriter
	bytesWritten int
	status       int
	wroteHeader  bool
}

func (w *loggingResponseWriter) Write(body []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}

	n, err := w.ResponseWriter.Write(body)
	w.bytesWritten += n

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
