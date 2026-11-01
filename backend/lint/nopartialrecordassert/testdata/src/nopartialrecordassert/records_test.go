package nopartialrecordassert

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type logRecord struct {
	Message string
}

func TestPartialChecks(t *testing.T) {
	records := []logRecord{{Message: "sniffed"}}
	pointers := []*logRecord{{Message: "sniffed"}}
	fixed := [1]logRecord{{Message: "sniffed"}}
	require.Contains(t, records, logRecord{Message: "sniffed"})                     // want "compare the complete slice with require\\.Equal, or with require\\.ElementsMatch when its order is not deterministic; a membership check on a slice of records misses an extra record, such as a false success log"
	require.NotContains(t, records, logRecord{Message: "success"})                  // want "compare the complete slice with require\\.Equal"
	require.Containsf(t, pointers, &logRecord{Message: "sniffed"}, "message %d", 1) // want "compare the complete slice with require\\.Equal"
	assert.Contains(t, fixed, logRecord{Message: "sniffed"})                        // want "compare the complete slice with require\\.Equal"
	require.New(t).NotContains(records, logRecord{Message: "success"})              // want "compare the complete slice with require\\.Equal"
}
