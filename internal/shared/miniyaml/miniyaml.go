// Package miniyaml is a small, dependency-free YAML reader/writer covering the
// subset of YAML that Kiro CLI V3 configuration actually uses:
//
//   - a top-level mapping of string keys to: scalars, block/flow sequences,
//     and nested mappings
//   - sequences of scalars and of mappings (e.g. permissions rules)
//   - quoted and unquoted scalar strings, integers, booleans
//
// It deliberately does NOT implement all of YAML. It exists so Config Control
// can read and write permissions.yaml and simple agent .md frontmatter without
// pulling in an external module: the project keeps zero third-party Go
// dependencies on purpose.
//
// Preservation guarantee: callers that cannot represent a document in this
// subset should fall back to preserving the raw text verbatim rather than
// risk corrupting it. Decode reports an error for constructs it does not
// understand so callers can take that fallback.
package miniyaml

import (
	"fmt"
	"strings"
)

// Decode parses a YAML document (the supported subset) into a
// map[string]interface{}. Values are string, bool, int, float64,
// []interface{}, or map[string]interface{}.
func Decode(data string) (map[string]interface{}, error) {
	lines := splitLines(data)
	p := &parser{lines: lines}
	v, err := p.parseBlock(0)
	if err != nil {
		return nil, err
	}
	if v == nil {
		return map[string]interface{}{}, nil
	}
	m, ok := v.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("miniyaml: top-level document is not a mapping")
	}
	return m, nil
}

// EncodeOrdered serialises m into the supported YAML subset, emitting top-level keys in the
// given order; keys of m missing from order follow, sorted.
func EncodeOrdered(order []string, m map[string]any) (string, error) {
	var b strings.Builder
	seen := map[string]bool{}
	emit := func(k string) error {
		seen[k] = true
		writeIndent(&b, 0)
		b.WriteString(encodeKey(k))
		b.WriteString(":")
		return encodeValue(&b, m[k], 0)
	}
	for _, k := range order {
		if _, ok := m[k]; ok && !seen[k] {
			if err := emit(k); err != nil {
				return "", err
			}
		}
	}
	for _, k := range sortedKeys(m) {
		if !seen[k] {
			if err := emit(k); err != nil {
				return "", err
			}
		}
	}
	return b.String(), nil
}

// TopLevelKeys returns the top-level mapping keys of a YAML document in the
// order they appear, so callers can preserve that order when re-encoding.
func TopLevelKeys(data string) []string {
	var keys []string
	for _, ln := range splitLines(data) {
		if ln.indent != 0 || strings.HasPrefix(ln.content, "- ") {
			continue
		}
		if k, _, ok := splitKey(ln.content); ok {
			keys = append(keys, k)
		}
	}
	return keys
}
