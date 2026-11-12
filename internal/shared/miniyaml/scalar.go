package miniyaml

import (
	"fmt"
	"strconv"
	"strings"
)

func parseScalarOrFlow(s string) (interface{}, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, nil
	}
	if strings.HasPrefix(s, "[") && strings.HasSuffix(s, "]") {
		inner := strings.TrimSpace(s[1 : len(s)-1])
		if inner == "" {
			return []interface{}{}, nil
		}
		parts := splitFlow(inner)
		arr := make([]interface{}, 0, len(parts))
		for _, p := range parts {
			v, err := parseScalarOrFlow(strings.TrimSpace(p))
			if err != nil {
				return nil, err
			}
			arr = append(arr, v)
		}
		return arr, nil
	}
	if strings.HasPrefix(s, "{") && strings.HasSuffix(s, "}") {
		inner := strings.TrimSpace(s[1 : len(s)-1])
		m := map[string]interface{}{}
		if inner == "" {
			return m, nil
		}
		for _, p := range splitFlow(inner) {
			key, rest, ok := splitKey(strings.TrimSpace(p))
			if !ok {
				return nil, fmt.Errorf("miniyaml: bad flow mapping entry %q", p)
			}
			v, err := parseScalarOrFlow(rest)
			if err != nil {
				return nil, err
			}
			m[key] = v
		}
		return m, nil
	}
	return parseScalar(s), nil
}

// splitFlow splits a flow collection body on top-level commas.
func splitFlow(s string) []string {
	var parts []string
	depth := 0
	var quote rune
	start := 0
	for i, r := range s {
		switch {
		case quote != 0:
			if r == quote {
				quote = 0
			}
		case r == '\'' || r == '"':
			quote = r
		case r == '[' || r == '{':
			depth++
		case r == ']' || r == '}':
			depth--
		case r == ',' && depth == 0:
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}

func parseScalar(s string) interface{} {
	if len(s) >= 2 && (s[0] == '"' || s[0] == '\'') {
		return unquote(s)
	}
	switch s {
	case "true", "True", "TRUE":
		return true
	case "false", "False", "FALSE":
		return false
	case "null", "~", "":
		return nil
	}
	if i, err := strconv.Atoi(s); err == nil {
		return i
	}
	if f, err := strconv.ParseFloat(s, 64); err == nil {
		return f
	}
	return s
}

func unquote(s string) string {
	if len(s) >= 2 {
		if (s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'') {
			return s[1 : len(s)-1]
		}
	}
	return s
}
