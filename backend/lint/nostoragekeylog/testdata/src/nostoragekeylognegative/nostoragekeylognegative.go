package nostoragekeylognegative

import (
	"context"
	"log/slog"
)

type storageKey string

func (key storageKey) digest() string { return string(key[:1]) }

type fileID string

type pipelineEvent struct {
	ctx        context.Context
	stage      string
	storageKey storageKey
}

func logDigests(ctx context.Context, logger *slog.Logger, key storageKey, id fileID, event pipelineEvent) string {
	logger.InfoContext(event.ctx, event.stage, slog.String("storage_key_digest", event.storageKey.digest()))
	logger.InfoContext(ctx, "uploaded", slog.String("storage_key_digest", key.digest()))
	logger.InfoContext(ctx, "uploaded", slog.String("file_id", string(id)))
	return string(key)
}
