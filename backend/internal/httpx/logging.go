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

			logger.InfoContext(
				r.Context(),
				"request started",
				"method", r.Method,
				"path", path,
				"remote_addr", r.RemoteAddr,
				"user_agent", r.UserAgent(),
			)

			recorder := &loggingResponseWriter{ResponseWriter: w}
			defer func() {
				if recovered := recover(); recovered != nil {
					if !recorder.wroteHeader {
						recorder.status = http.StatusInternalServerError
					}

					logger.ErrorContext(
						r.Context(),
						"request completed",
						"method", r.Method,
						"path", path,
						"status", recorder.statusCode(),
						"bytes", recorder.bytes,
						"duration_ms", time.Since(started).Milliseconds(),
						"panicked", true,
						"panic", fmt.Sprint(recovered),
					)
					panic(recovered)
				}

				logger.InfoContext(
					r.Context(),
					"request completed",
					"method", r.Method,
					"path", path,
					"status", recorder.statusCode(),
					"bytes", recorder.bytes,
					"duration_ms", time.Since(started).Milliseconds(),
				)
			}()

			next.ServeHTTP(recorder, r)
		})
	}
}

type loggingResponseWriter struct {
	http.ResponseWriter
	bytes       int
	status      int
	wroteHeader bool
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

func (w *loggingResponseWriter) statusCode() int {
	if w.status == 0 {
		return http.StatusOK
	}

	return w.status
}
