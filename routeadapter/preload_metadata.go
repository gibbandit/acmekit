package routeadapter

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

const preloadMetadataPrefix = `<script id="route-preloads" type="application/json">`

type preloadMetadata struct {
	Version          int       `json:"version"`
	Preloads         []Preload `json:"preloads"`
	PreloadTimeoutMs uint32    `json:"preloadTimeoutMs,omitempty"`
}

// Read only the application's explicit metadata slot, never Start's hydration data.
func readPreloadMetadata(content []byte) (preloadMetadata, error) {
	prefix := []byte(preloadMetadataPrefix)
	if bytes.Count(content, prefix) != 1 {
		return preloadMetadata{}, errors.New("must contain exactly one preload metadata script")
	}
	payload := content[bytes.Index(content, prefix)+len(prefix):]
	end := bytes.Index(payload, []byte(`</script>`))
	if end < 0 {
		return preloadMetadata{}, errors.New("preload metadata script is not closed")
	}
	var metadata preloadMetadata
	decoder := json.NewDecoder(bytes.NewReader(payload[:end]))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&metadata); err != nil {
		return preloadMetadata{}, fmt.Errorf("decode preload metadata: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return preloadMetadata{}, errors.New("preload metadata must contain one JSON object")
	}
	if metadata.Version != 1 {
		return preloadMetadata{}, fmt.Errorf("unsupported preload metadata version: %d", metadata.Version)
	}
	if metadata.Preloads == nil {
		return preloadMetadata{}, errors.New("preload metadata requires a preloads array")
	}
	for _, preload := range metadata.Preloads {
		if preload.Variables == nil {
			return preloadMetadata{}, fmt.Errorf("preload %q requires a variables object", preload.ID)
		}
	}
	return metadata, nil
}
