package nopartialrecordassertnegative

import "github.com/stretchr/testify/require"

type logRecord struct {
	Message string
}

func productionHelper(t require.TestingT, records []logRecord) {
	require.Contains(t, records, logRecord{})
}
