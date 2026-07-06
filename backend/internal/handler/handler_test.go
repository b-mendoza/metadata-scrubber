package handler

import "testing"

func TestContentDisposition(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		filename string
		want     string
	}{
		"base filename": {
			filename: "report.pdf",
			want:     `attachment; filename=report.pdf`,
		},
		"path stripped": {
			filename: "/tmp/report.pdf",
			want:     `attachment; filename=report.pdf`,
		},
		"quotes and backslashes escaped": {
			filename: `bad"\name.pdf`,
			want:     `attachment; filename="bad\"\\name.pdf"`,
		},
		"control bytes encoded": {
			filename: "bad\r\n\x00\x7fname.pdf",
			want:     `attachment; filename*=utf-8''bad%0D%0A%00%7Fname.pdf`,
		},
		"unicode filename encoded": {
			filename: "resume-été.pdf",
			want:     `attachment; filename*=utf-8''resume-%C3%A9t%C3%A9.pdf`,
		},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			if got := contentDisposition(tt.filename); got != tt.want {
				t.Fatalf("contentDisposition(%q) = %q, want %q", tt.filename, got, tt.want)
			}
		})
	}
}
