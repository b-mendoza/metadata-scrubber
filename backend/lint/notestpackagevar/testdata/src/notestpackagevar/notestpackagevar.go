package notestpackagevar

type settings struct {
	limit  int
	labels map[string]string
}

var (
	download    = func() string { return "real" }
	counter     int
	current     settings
	currentPtr  = &settings{}
	limitsTable = []int{1}
)

func productionWrite() {
	counter = 1
}
