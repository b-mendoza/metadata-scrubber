package storage_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/storage"
)

func TestFakePropagatesContextCancellationWithoutMutation(t *testing.T) {
	t.Parallel()

	fake := storage.NewFake()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := fake.PresignSourceUpload(ctx, "file-1", 1024, time.Minute)
	require.ErrorIs(t, err, context.Canceled)
	err = fake.UploadSanitized(ctx, "file-1", canonicalETagOne, []byte("not stored"))
	require.ErrorIs(t, err, context.Canceled)
	err = fake.DeleteFlow(ctx, "file-1")
	require.ErrorIs(t, err, context.Canceled)
	_, exists, stateErr := fake.SanitizedBytes("file-1", canonicalETagOne)
	require.NoError(t, stateErr)
	require.False(t, exists)
}

func TestFakeInjectsIndependentOrdinaryFailuresForEveryOperation(t *testing.T) {
	t.Parallel()

	injectedErr := errors.New("synthetic dependency failure")
	for _, testCase := range []struct {
		operation storage.FakeOperation
		invoke    func(*storage.Fake) error
	}{
		{
			operation: storage.FakePresignSourceUpload,
			invoke: func(fake *storage.Fake) error {
				_, err := fake.PresignSourceUpload(context.Background(), "file-1", 1024, time.Minute)
				return err
			},
		},
		{
			operation: storage.FakePresignSanitizedDownload,
			invoke: func(fake *storage.Fake) error {
				_, err := fake.PresignSanitizedDownload(context.Background(), "file-1", canonicalETagOne, time.Minute)
				return err
			},
		},
		{
			operation: storage.FakeSourceExists,
			invoke: func(fake *storage.Fake) error {
				_, err := fake.SourceExists(context.Background(), "file-1")
				return err
			},
		},
		{
			operation: storage.FakeDownloadSource,
			invoke: func(fake *storage.Fake) error {
				_, err := fake.DownloadSource(context.Background(), "file-1", "")
				return err
			},
		},
		{
			operation: storage.FakeSanitizedExists,
			invoke: func(fake *storage.Fake) error {
				_, err := fake.SanitizedExists(context.Background(), "file-1", canonicalETagOne)
				return err
			},
		},
		{
			operation: storage.FakeUploadSanitized,
			invoke: func(fake *storage.Fake) error {
				return fake.UploadSanitized(context.Background(), "file-1", canonicalETagOne, []byte("not stored"))
			},
		},
		{
			operation: storage.FakeDeleteFlow,
			invoke: func(fake *storage.Fake) error {
				return fake.DeleteFlow(context.Background(), "file-1")
			},
		},
	} {
		t.Run(string(testCase.operation), func(t *testing.T) {
			fake := storage.NewFake()
			fake.SetFailure(testCase.operation, injectedErr)

			err := testCase.invoke(fake)

			require.ErrorIs(t, err, injectedErr)
			require.NotErrorIs(t, err, storage.ErrSourceRevisionConflict)
			_, exists, stateErr := fake.SanitizedBytes("file-1", canonicalETagOne)
			require.NoError(t, stateErr)
			require.False(t, exists)
		})
	}
}
