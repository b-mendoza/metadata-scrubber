package nodeferfunclitnegative

type resource struct{}

func (resource) Close() {}

func deferredNamedCalls(value resource, cancel func()) {
	defer cancel()
	defer value.Close()
	go func() {}()
}
