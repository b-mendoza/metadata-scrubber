package nodeferfunclit

func deferredLiteral(release func()) {
	defer func() { // want "move this deferred cleanup into a named function and defer a call to it; a named function keeps cleanup logic separate from the operation that it follows"
		release()
	}()
}

func deferredParenthesizedLiteral(release func(int)) {
	defer (func(value int) { // want "move this deferred cleanup into a named function and defer a call to it"
		release(value)
	})(1)
}
