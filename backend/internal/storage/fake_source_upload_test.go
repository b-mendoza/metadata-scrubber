package storage_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/storage"
)

func TestFakePresignedUploadPinsUploadContractAndRecordsSizeAndExpiry(t *testing.T) {
	t.Parallel()

	fake := storage.NewFake()
	grant, err := fake.PresignSourceUpload(context.Background(), "file-1", 1024, 2*time.Minute)

	require.NoError(t, err)
	require.Equal(t, storage.PDFContentType, grant.RequiredHeaders.Get("Content-Type"))
	require.Equal(t, "1024", grant.RequiredHeaders.Get("Content-Length"))
	grant.RequiredHeaders.Set("Content-Type", "text/plain")

	secondGrant, err := fake.PresignSourceUpload(
		context.Background(),
		"file-1",
		storage.MaxSourceObjectBytes,
		3*time.Minute,
	)
	require.NoError(t, err)
	require.Equal(t, storage.PDFContentType, secondGrant.RequiredHeaders.Get("Content-Type"))

	calls := fake.Calls()
	require.Equal(t, 2*time.Minute, calls[0].Expiry)
	require.Equal(t, 3*time.Minute, calls[1].Expiry)
	require.Equal(t, int64(1024), calls[0].SizeBytes)
	require.Equal(t, int64(storage.MaxSourceObjectBytes), calls[1].SizeBytes)
	require.Equal(t, "source/file-1", calls[0].ObjectKey)
}

func TestFakeRejectsInvalidExpiryBeforeRecordingCalls(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name   string
		expiry time.Duration
	}{
		{name: "zero", expiry: 0},
		{name: "negative", expiry: -time.Second},
		{name: "below one second", expiry: time.Millisecond},
		{name: "fractional second", expiry: time.Second + time.Millisecond},
		{name: "beyond seven days", expiry: 7*24*time.Hour + time.Second},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			fake := storage.NewFake()

			_, err := fake.PresignSourceUpload(context.Background(), "file-1", 1024, testCase.expiry)

			require.ErrorIs(t, err, storage.ErrInvalidPresignExpiry)
			require.Empty(t, fake.Calls())
		})
	}
}

func TestFakeRejectsInvalidUploadSizesBeforeRecordingCalls(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name      string
		sizeBytes int64
		wantErr   error
	}{
		{name: "zero bytes", sizeBytes: 0, wantErr: storage.ErrInvalidSourceSize},
		{name: "negative bytes", sizeBytes: -1, wantErr: storage.ErrInvalidSourceSize},
		{
			name:      "one byte above the memory boundary",
			sizeBytes: storage.MaxSourceObjectBytes + 1,
			wantErr:   storage.ErrSourceObjectTooLarge,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			fake := storage.NewFake()

			_, err := fake.PresignSourceUpload(context.Background(), "file-1", testCase.sizeBytes, time.Minute)

			require.ErrorIs(t, err, testCase.wantErr)
			require.Empty(t, fake.Calls())
		})
	}
}
