package nodeferfunclitnegative

type resource struct{}

func (resource) Close() {}

func closeResource(value resource) {
	value.Close()
}

func deferredNamedCalls(value resource, cancel func()) {
	defer cancel()
	defer value.Close()
	defer closeResource(value)
	go func() {}()
}
