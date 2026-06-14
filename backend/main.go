// Package main serves the metadata scrubber HTTP API.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

const (
	healthCheckArg     = "healthcheck"
	healthCheckPath    = "/api/health"
	healthCheckTimeout = 2 * time.Second
	readHeaderTimeout  = 5 * time.Second
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == healthCheckArg {
		if err := runHealthCheck(os.Getenv("PORT")); err != nil {
			log.Fatal(err)
		}
		return
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	addr := ":" + port
	server := newServer(addr)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

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
		if err != nil {
			log.Fatal(err)
		}
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Fatal(err)
		}
		if err := <-serverErr; err != nil {
			log.Fatal(err)
		}
	}
}

func newServer(addr string) *http.Server {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", handleHealth)
	mux.HandleFunc("POST /api/scrub", handleScrub)

	return &http.Server{
		Addr:              addr,
		Handler:           withCORS(mux),
		ReadHeaderTimeout: readHeaderTimeout,
	}
}

func runHealthCheck(port string) error {
	if port == "" {
		port = "8080"
	}

	client := http.Client{Timeout: healthCheckTimeout}
	response, err := client.Get("http://127.0.0.1:" + port + healthCheckPath)
	if err != nil {
		return err
	}
	defer func() { _ = response.Body.Close() }()

	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("healthcheck returned status %d", response.StatusCode)
	}
	return nil
}

// handleHealth is a simple sanity-check endpoint the frontend can fetch to
// confirm the backend is up and reachable.
func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"message": "Hello, World!"})
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
