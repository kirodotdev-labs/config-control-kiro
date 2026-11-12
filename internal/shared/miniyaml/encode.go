package miniyaml

import (
	"fmt"
	"strconv"
	"strings"
)

func encodeMap(b *strings.Builder, m map[string]interface{}, indent int) error {
	keys := sortedKeys(m)
	for _, k := range keys {
		v := m[k]
		writeIndent(b, indent)
		b.WriteString(encodeKey(k))
		b.WriteString(":")
		if err := encodeValue(b, v, indent); err != nil {
			return err
		}
	}
	return nil
}

func encodeValue(b *strings.Builder, v interface{}, indent int) error {
	switch t := v.(type) {
	case nil:
		b.WriteString("\n")
	case map[string]interface{}:
		b.WriteString("\n")
		return encodeMap(b, t, indent+2)
	case []interface{}:
		if len(t) == 0 {
			b.WriteString(" []\n") // an empty list, not null
			return nil
		}
		b.WriteString("\n")
		// Items are indented under their key; a mapping item's first key sits
		// on the dash line and its remaining keys align with it.
		for _, item := range t {
			writeIndent(b, indent+2)
			b.WriteString("- ")
			switch it := item.(type) {
			case map[string]interface{}:
				if err := encodeSeqMap(b, it, indent+4); err != nil {
					return err
				}
			default:
				b.WriteString(encodeScalar(item))
				b.WriteString("\n")
			}
		}
	default:
		b.WriteString(" ")
		b.WriteString(encodeScalar(v))
		b.WriteString("\n")
	}
	return nil
}

// encodeSeqMap writes a mapping that is an element of a sequence; the caller has
// already written "- " at the current position.
func encodeSeqMap(b *strings.Builder, m map[string]interface{}, indent int) error {
	keys := sortedKeys(m)
	for i, k := range keys {
		if i > 0 {
			writeIndent(b, indent)
		}
		b.WriteString(encodeKey(k))
		b.WriteString(":")
		if err := encodeValue(b, m[k], indent); err != nil {
			return err
		}
	}
	if len(keys) == 0 {
		b.WriteString("{}\n")
	}
	return nil
}

func encodeScalar(v interface{}) string {
	switch t := v.(type) {
	case string:
		if needsQuote(t) {
			return "\"" + strings.ReplaceAll(t, "\"", "\\\"") + "\""
		}
		return t
	case bool:
		if t {
			return "true"
		}
		return "false"
	case int:
		return strconv.Itoa(t)
	case int64:
		return strconv.FormatInt(t, 10)
	case float64:
		return strconv.FormatFloat(t, 'g', -1, 64)
	case nil:
		return "null"
	default:
		return fmt.Sprintf("%v", t)
	}
}

func encodeKey(k string) string {
	if needsQuote(k) {
		return "\"" + k + "\""
	}
	return k
}

func needsQuote(s string) bool {
	if s == "" {
		return true
	}
	switch s {
	case "true", "false", "null", "True", "False", "~":
		return true
	}
	// Quote if it would be misread as a number, or contains YAML-significant chars.
	if _, err := strconv.Atoi(s); err == nil {
		return true
	}
	if _, err := strconv.ParseFloat(s, 64); err == nil {
		return true
	}
	return strings.ContainsAny(s, ":#[]{}&*!|>'\"%@`,\n") || strings.HasPrefix(s, "- ") || strings.HasPrefix(s, " ") || strings.HasSuffix(s, " ")
}

func writeIndent(b *strings.Builder, n int) {
	for i := 0; i < n; i++ {
		b.WriteByte(' ')
	}
}

func sortedKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	// simple insertion sort to avoid importing sort for determinism clarity
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j-1] > keys[j]; j-- {
			keys[j-1], keys[j] = keys[j], keys[j-1]
		}
	}
	return keys
}
