package nostoragekeylog

import (
	"context"
	"fmt"
	"log/slog"
)

type storageKey string

func (key storageKey) digest() string { return string(key[:1]) }

func (key storageKey) String() string { return string(key) }

type request struct {
	StorageKey storageKey
}

func logRawKeys(ctx context.Context, logger *slog.Logger, key storageKey, input request, keys []storageKey) {
	logger.InfoContext(ctx, "uploaded", slog.String("storage_key", string(key)))              // want "log storageKey\\.digest\\(\\) instead of the raw storage key; the key identifies a stored object, and its digest lets logs follow one file without exposing it"
	logger.InfoContext(ctx, "uploaded", slog.Any("storage_key", key))                         // want "log storageKey\\.digest\\(\\) instead of the raw storage key"
	logger.InfoContext(ctx, "uploaded", slog.String("storage_key", key.String()))             // want "log storageKey\\.digest\\(\\) instead of the raw storage key"
	logger.InfoContext(ctx, "uploaded", slog.String("storage_key", fmt.Sprint(key)))          // want "log storageKey\\.digest\\(\\) instead of the raw storage key"
	logger.InfoContext(ctx, "uploaded", slog.Any("request", input))                           // want "log storageKey\\.digest\\(\\) instead of the raw storage key"
	logger.InfoContext(ctx, "uploaded", slog.Any("keys", keys))                               // want "log storageKey\\.digest\\(\\) instead of the raw storage key"
	_ = logger.With(slog.Any("storage_key", &key))                                            // want "log storageKey\\.digest\\(\\) instead of the raw storage key"
	logger.InfoContext(ctx, "uploaded", slog.String("storage_key", string(input.StorageKey))) // want "log storageKey\\.digest\\(\\) instead of the raw storage key"
}
