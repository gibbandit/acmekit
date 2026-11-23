package routeadapter

import (
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"
)

var preservedPathEscape = regexp.MustCompile(`(?i)%25|%5c`)
var pathEscape = regexp.MustCompile(`(?i)%[0-9a-f]{2}`)

// Mirror the router's decodePath before splitting URL segments. Encoded slash
// remains a segment's data, and encoded percent/backslash survives this phase.
func decodeFrontendPath(raw string) string {
	var decoded strings.Builder
	cursor := 0
	for _, span := range preservedPathEscape.FindAllStringIndex(raw, -1) {
		decoded.WriteString(decodePathChunk(raw[cursor:span[0]]))
		decoded.WriteString(raw[span[0]:span[1]])
		cursor = span[1]
	}
	decoded.WriteString(decodePathChunk(raw[cursor:]))
	return decoded.String()
}

func decodePathChunk(raw string) string {
	// decodeURI preserves URI-reserved ASCII characters and their escape casing.
	var decoded strings.Builder
	valid := true
	for index := 0; index < len(raw); index++ {
		if raw[index] != '%' {
			decoded.WriteByte(raw[index])
			continue
		}
		if index+2 >= len(raw) {
			valid = false
			break
		}
		value, err := url.PathUnescape(raw[index : index+3])
		if err != nil {
			valid = false
			break
		}
		if strings.ContainsAny(value, ";/?:@&=+$,#") {
			decoded.WriteString(raw[index : index+3])
		} else {
			decoded.WriteString(value)
		}
		index += 2
	}
	value := decoded.String()
	if !valid || !utf8.ValidString(value) {
		// The native fallback decodes each valid ASCII triplet independently.
		// A lone non-ASCII triplet fails decodeURI and keeps its escaped spelling.
		value = pathEscape.ReplaceAllStringFunc(raw, func(escape string) string {
			character, _ := url.PathUnescape(escape) // The regexp guarantees a valid triplet.
			if character[0] < utf8.RuneSelf && !strings.ContainsAny(character, ";/?:@&=+$,#") {
				return character
			}
			return escape
		})
	}
	var safe strings.Builder
	for index := 0; index < len(value); index++ {
		character := value[index]
		if character < 0x20 || character == 0x7f || strings.ContainsRune("\"<>`{}", rune(character)) {
			const hex = "0123456789ABCDEF"
			safe.WriteByte('%')
			safe.WriteByte(hex[character>>4])
			safe.WriteByte(hex[character&15])
		} else {
			safe.WriteByte(character)
		}
	}
	return safe.String()
}
