//go:build !dev

// Package web contains the compiled application, embedded into the Go binary.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist/client
var compiled embed.FS

// Operations is compiler-owned query text, deliberately outside the public FS.
//
//go:embed persisted-queries.json
var Operations []byte

// FS exposes the SPA shell and hashed assets produced by the frontend build.
var FS = func() fs.FS {
	assets, err := fs.Sub(compiled, "dist/client")
	if err != nil {
		panic(err)
	}
	return assets
}()
