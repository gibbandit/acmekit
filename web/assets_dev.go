//go:build dev

// Package web leaves frontend serving to Vite in development.
package web

import "io/fs"

// FS is nil in development, so the Go server exposes only its API.
var FS fs.FS

// Operations is nil in development; Relay requests include query text.
var Operations []byte
