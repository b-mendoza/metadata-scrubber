package storage_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/storage"
)

const (
	canonicalETagOne = "0123456789abcdef0123456789abcdef"
	canonicalETagTwo = "fedcba9876543210fedcba9876543210"
)

var _ storage.Storage = (*storage.Fake)(nil)

func TestNormalizeProviderETagClassifiesProviderValues(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name         string
		providerETag string
		want         string
		wantErr      bool
	}{
		{name: "quoted strong ETag", providerETag: `"` + canonicalETagOne + `"`, want: canonicalETagOne},
		{name: "empty value", providerETag: "", wantErr: true},
		{name: "unquoted ETag", providerETag: canonicalETagOne, wantErr: true},
		{name: "weak ETag", providerETag: `W/"` + canonicalETagOne + `"`, wantErr: true},
		{name: "empty quoted value", providerETag: `""`, wantErr: true},
		{name: "double-quoted ETag", providerETag: `""` + canonicalETagOne + `""`, wantErr: true},
		{name: "leading space", providerETag: ` "` + canonicalETagOne + `"`, wantErr: true},
		{name: "trailing space", providerETag: `"` + canonicalETagOne + `" `, wantErr: true},
		{name: "embedded newline", providerETag: `"0123456789abcdef0123456789abcde` + "\n" + `"`, wantErr: true},
		{name: "uppercase ETag", providerETag: `"0123456789ABCDEF0123456789ABCDEF"`, wantErr: true},
		{name: "multipart ETag", providerETag: `"0123456789abcdef0123456789abcdef-2"`, wantErr: true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			normalized, err := storage.NormalizeProviderETag(testCase.providerETag)
			if testCase.wantErr {
				require.ErrorIs(t, err, storage.ErrInvalidETag)
				return
			}

			require.NoError(t, err)
			require.Equal(t, testCase.want, normalized)
		})
	}
}

func TestObjectKeysBindSanitizedStateToExactRevision(t *testing.T) {
	t.Parallel()

	sourceKey, err := storage.SourceObjectKey("file-1")
	require.NoError(t, err)
	require.Equal(t, "source/file-1", sourceKey)

	for _, testCase := range []struct {
		name       string
		fileID     string
		sourceETag string
		want       string
	}{
		{
			name:       "canonical revision",
			fileID:     "file-1",
			sourceETag: canonicalETagOne,
			want:       "sanitized/file-1/MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY",
		},
		{
			name:       "different revision",
			fileID:     "file-1",
			sourceETag: canonicalETagTwo,
			want:       "sanitized/file-1/ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA",
		},
		{
			name:       "different file",
			fileID:     "file-2",
			sourceETag: canonicalETagOne,
			want:       "sanitized/file-2/MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			objectKey, keyErr := storage.SanitizedObjectKey(testCase.fileID, testCase.sourceETag)

			require.NoError(t, keyErr)
			require.Equal(t, testCase.want, objectKey)
			require.NotContains(t, strings.TrimPrefix(objectKey, "sanitized/"+testCase.fileID+"/"), "/")
		})
	}
}

func TestObjectKeysRejectInvalidLogicalIdentifiers(t *testing.T) {
	t.Parallel()

	for _, fileID := range []string{"", ".", "..", "folder/file", " file", "file\n"} {
		t.Run("file ID "+fileID, func(t *testing.T) {
			_, sourceErr := storage.SourceObjectKey(fileID)
			_, sanitizedErr := storage.SanitizedObjectKey(fileID, canonicalETagOne)

			require.ErrorIs(t, sourceErr, storage.ErrInvalidFileID)
			require.ErrorIs(t, sanitizedErr, storage.ErrInvalidFileID)
		})
	}

	for _, sourceETag := range []string{
		"",
		`"` + canonicalETagOne + `"`,
		`W/"` + canonicalETagOne + `"`,
		" " + canonicalETagOne,
		canonicalETagOne + " ",
		"0123456789abcdef0123456789abcde\n",
		"0123456789ABCDEF0123456789ABCDEF",
		canonicalETagOne + "-2",
		"0123456789abcdef0123456789abcde",
		canonicalETagOne + "0",
		"g123456789abcdef0123456789abcdef",
	} {
		t.Run("ETag "+sourceETag, func(t *testing.T) {
			_, err := storage.SanitizedObjectKey("file-1", sourceETag)

			require.ErrorIs(t, err, storage.ErrInvalidETag)
		})
	}
}
