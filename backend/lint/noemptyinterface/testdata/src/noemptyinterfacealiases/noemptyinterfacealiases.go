package noemptyinterfacealiases

type Dynamic = any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"

type Dynamic2 interface{} // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
