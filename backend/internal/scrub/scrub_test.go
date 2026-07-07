package scrub

import (
	"errors"
	"testing"
)

func TestScrubRejectsUnsupportedTypeWithSentinel(t *testing.T) {
	tests := []struct {
		name     string
		filename string
	}{
		{
			name:     "unsupported extension",
			filename: "notes.txt",
		},
		{
			name:     "missing extension",
			filename: "README",
		},
		{
			name:     "empty filename",
			filename: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Scrub(tt.filename, []byte("plain text"))

			if !errors.Is(err, ErrUnsupportedType) {
				t.Fatalf("Scrub(%q) error = %v, want %v", tt.filename, err, ErrUnsupportedType)
			}
			if got != nil {
				t.Fatalf("Scrub(%q) output = %q, want nil", tt.filename, got)
			}
		})
	}
}
