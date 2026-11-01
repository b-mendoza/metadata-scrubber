package notestpackagevar

import "testing"

func TestPackageVariableWrites(t *testing.T) {
	download = func() string { return "fake" } // want "pass this test dependency as an argument or set a field on the test instance; writing a package variable changes the dependency for every test and request that runs at the same time"
	counter++                                  // want "pass this test dependency as an argument or set a field on the test instance"
	counter += 2                               // want "pass this test dependency as an argument or set a field on the test instance"
	current.limit = 3                          // want "pass this test dependency as an argument or set a field on the test instance"
	current.labels["name"] = "value"           // want "pass this test dependency as an argument or set a field on the test instance"
	(*currentPtr).limit = 4                    // want "pass this test dependency as an argument or set a field on the test instance"
	limitsTable[0] = 5                         // want "pass this test dependency as an argument or set a field on the test instance"
}
