package nopartialrecordassertnegative

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAllowedChecks(t *testing.T) {
	records := []logRecord{{Message: "sniffed"}}
	require.Equal(t, []logRecord{{Message: "sniffed"}}, records)
	require.Contains(t, "raw log text", "log")
	require.NotContains(t, []string{"a"}, "b")
	require.Contains(t, map[string]logRecord{}, "key")
}
