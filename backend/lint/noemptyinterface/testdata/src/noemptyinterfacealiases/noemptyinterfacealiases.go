package noemptyinterfacealiases

//policy:allow-any: this exported alias names values from an untyped source.
type Dynamic = any

//policy:allow-any: this exported defined type names values from an untyped source.
type Dynamic2 interface{}
