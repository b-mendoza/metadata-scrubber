package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/config"
	"metadata-scrubber/internal/httpx/header"
)

const (
	startupR2AccountID       = "startup-account-id-sentinel"
	startupR2AccessKeyID     = "startup-access-key-id-sentinel"
	startupR2SecretAccessKey = "startup-secret-access-key-sentinel"
	startupR2Bucket          = "startup-bucket-sentinel"
)

func TestRunRejectsIncompleteOrInvalidR2ConfigurationBeforeStartingServer(t *testing.T) {
	for _, testCase := range []struct {
		name          string
		configureFail func(t *testing.T)
		affectedField string
	}{
		{
			name: "missing required value",
			configureFail: func(t *testing.T) {
				t.Helper()
				unsetStartupEnvironmentValue(t, "R2_SECRET_ACCESS_KEY")
			},
			affectedField: "R2SecretAccessKey",
		},
		{
			name: "blank required value",
			configureFail: func(t *testing.T) {
				t.Helper()
				t.Setenv("R2_ACCOUNT_ID", " \t\n")
			},
			affectedField: "R2AccountID",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			setValidStartupEnvironment(t)
			testCase.configureFail(t)

			err := run(context.Background())

			require.Error(t, err)
			require.ErrorContains(t, err, "invalid configuration")
			require.ErrorContains(t, err, testCase.affectedField)
			require.NotContains(t, err.Error(), startupR2AccountID)
			require.NotContains(t, err.Error(), startupR2AccessKeyID)
			require.NotContains(t, err.Error(), startupR2SecretAccessKey)
			require.NotContains(t, err.Error(), startupR2Bucket)
		})
	}
}

func TestNewServerConfiguresAddressAndHandler(t *testing.T) {
	t.Parallel()

	server := newTestServer(discardLogger())

	require.Equal(t, ":0", server.Addr)
	require.Equal(t, readHeaderTimeout, server.ReadHeaderTimeout)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)

	server.Handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
}

func TestNewServerLogsRequests(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer
	server := newTestServer(slog.New(slog.NewJSONHandler(&logs, nil)))

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)

	server.Handler.ServeHTTP(recorder, request)

	record := readServerCompletionLogRecord(t, logs.Bytes())
	require.Equal(t, "/api/health", record.Path)
	require.Equal(t, http.StatusOK, record.Status)
}

func TestNewServerHandlesCORSPreflight(t *testing.T) {
	t.Parallel()

	server := newTestServer(discardLogger())
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodOptions, "/api/scrub", nil)

	server.Handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
	require.Equal(t, "*", recorder.Header().Get(header.AccessControlAllowOrigin))
	require.Contains(t, recorder.Header().Get(header.AccessControlAllowMethods), http.MethodOptions)
}

func TestNewServerRoutesScrubUploads(t *testing.T) {
	t.Parallel()

	server := newTestServer(discardLogger())
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/scrub", nil)

	server.Handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
}

func setValidStartupEnvironment(t *testing.T) {
	t.Helper()

	t.Setenv("R2_ACCOUNT_ID", startupR2AccountID)
	t.Setenv("R2_ACCESS_KEY_ID", startupR2AccessKeyID)
	t.Setenv("R2_SECRET_ACCESS_KEY", startupR2SecretAccessKey)
	t.Setenv("R2_BUCKET", startupR2Bucket)
}

func unsetStartupEnvironmentValue(t *testing.T, key string) {
	t.Helper()

	t.Setenv(key, "")
	require.NoError(t, os.Unsetenv(key))
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func newTestServer(logger *slog.Logger) *http.Server {
	cfg := config.Config{Port: 0}

	return newServer(cfg, logger)
}

type serverLogRecord struct {
	Message string `json:"msg"`
	Path    string `json:"path"`
	Status  int    `json:"status"`
}

func readServerCompletionLogRecord(t *testing.T, data []byte) serverLogRecord {
	t.Helper()

	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		var record serverLogRecord
		require.NoError(t, json.Unmarshal(scanner.Bytes(), &record))
		if record.Message == "request completed" {
			return record
		}
	}
	require.NoError(t, scanner.Err())
	require.FailNow(t, "request completion log record not found")

	panic("unreachable")
}
