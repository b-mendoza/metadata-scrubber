// Package main serves the metadata scrubber HTTP API.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/pdfcpu/pdfcpu/pkg/api"
)

// maxUploadSize caps the size of an uploaded file (25 MB) to keep memory usage bounded.
const maxUploadSize = 25 << 20

const readHeaderTimeout = 5 * time.Second

func main() {
	// pdfcpu otherwise tries to create a config dir under $HOME on first use,
	// which panics on a read-only/scratch rootfs. RemoveProperties needs no
	// config, so disable it.
	api.DisableConfigDir()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := run(ctx); err != nil {
		log.Fatal(err)
	}
}

// run starts the HTTP server and blocks until it fails or ctx is cancelled, at
// which point it attempts a graceful shutdown. It returns the first error
// encountered, or nil on a clean shutdown.
func run(ctx context.Context) error {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	addr := ":" + port
	server := newServer(addr)

	serverErr := make(chan error, 1)
	go func() {
		log.Printf("metadata-scrubber listening on %s", addr)
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
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return err
		}
		return <-serverErr
	}
}

func newServer(addr string) *http.Server {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", handleReachability)
	mux.HandleFunc("POST /api/scrub", handleScrub)

	return &http.Server{
		Addr:              addr,
		Handler:           withCORS(mux),
		ReadHeaderTimeout: readHeaderTimeout,
	}
}

// handleReachability gives callers a cheap way to verify the backend HTTP API is reachable.
func handleReachability(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "reachable"})
}

// handleScrub accepts a multipart upload under the form field "file", removes
// its metadata, and streams the cleaned file back to the client.
func handleScrub(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing or invalid \"file\" form field")
		return
	}
	defer func() { _ = file.Close() }()

	// pdfcpu needs an io.ReadSeeker, so buffer the upload into memory.
	src, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read uploaded file")
		return
	}

	cleaned, err := scrub(header.Filename, src)
	if err != nil {
		if errors.Is(err, errUnsupportedType) {
			writeError(w, http.StatusUnsupportedMediaType, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "could not scrub file: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filepath.Base(header.Filename)+"\"")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(cleaned)
}

var errUnsupportedType = errors.New("unsupported file type")

// scrub dispatches on file extension and returns the metadata-free bytes.
// Today only PDF is wired up; add DOCX/TXT branches here as you build out.
func scrub(filename string, src []byte) ([]byte, error) {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".pdf":
		var out bytes.Buffer
		// An empty property list tells pdfcpu to remove all document properties.
		if err := api.RemoveProperties(bytes.NewReader(src), &out, nil, nil); err != nil {
			return nil, err
		}
		return out.Bytes(), nil
	default:
		return nil, errUnsupportedType
	}
}

// withCORS allows the frontend dev server to call this API from another origin.
// Loosen or tighten as needed; it's permissive here purely for local development.
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
