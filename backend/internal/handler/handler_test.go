package handler

import "testing"

func TestContentDisposition(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		filename string
		want     string
	}{
		{
			name:     "base filename",
			filename: "report.pdf",
			want:     `attachment; filename=report.pdf`,
		},
		{
			name:     "path stripped",
			filename: "/tmp/report.pdf",
			want:     `attachment; filename=report.pdf`,
		},
		{
			name:     "quotes and backslashes escaped",
			filename: `bad"\name.pdf`,
			want:     `attachment; filename="bad\"\\name.pdf"`,
		},
		{
			name:     "control bytes encoded",
			filename: "bad\r\n\x00\x7fname.pdf",
			want:     `attachment; filename*=utf-8''bad%0D%0A%00%7Fname.pdf`,
		},
		{
			name:     "unicode filename encoded",
			filename: "resume-été.pdf",
			want:     `attachment; filename*=utf-8''resume-%C3%A9t%C3%A9.pdf`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := contentDisposition(tt.filename); got != tt.want {
				t.Fatalf("contentDisposition(%q) = %q, want %q", tt.filename, got, tt.want)
			}
		})
	}
}
