package miniyaml

import (
	"fmt"
	"strings"
)

type line struct {
	indent  int
	content string // trimmed of leading indent and trailing CR
	raw     string
}

func splitLines(data string) []line {
	var out []line
	for _, raw := range strings.Split(data, "\n") {
		trimmedRight := strings.TrimRight(raw, "\r")
		// Skip blank lines and comment-only lines.
		noIndent := strings.TrimLeft(trimmedRight, " ")
		if noIndent == "" || strings.HasPrefix(noIndent, "#") {
			continue
		}
		indent := len(trimmedRight) - len(noIndent)
		out = append(out, line{indent: indent, content: noIndent, raw: trimmedRight})
	}
	return out
}

type parser struct {
	lines []line
	pos   int
}

// parseBlock parses a mapping or sequence at the given minimum indent.
func (p *parser) parseBlock(minIndent int) (interface{}, error) {
	if p.pos >= len(p.lines) {
		return nil, nil
	}
	first := p.lines[p.pos]
	if first.indent < minIndent {
		return nil, nil
	}
	if strings.HasPrefix(first.content, "- ") || first.content == "-" {
		return p.parseSequence(first.indent)
	}
	return p.parseMapping(first.indent)
}

func (p *parser) parseMapping(indent int) (interface{}, error) {
	m := map[string]interface{}{}
	for p.pos < len(p.lines) {
		ln := p.lines[p.pos]
		if ln.indent < indent {
			break
		}
		if ln.indent > indent {
			return nil, fmt.Errorf("miniyaml: unexpected indent at %q", ln.raw)
		}
		key, rest, ok := splitKey(ln.content)
		if !ok {
			return nil, fmt.Errorf("miniyaml: expected 'key:' at %q", ln.raw)
		}
		p.pos++
		if rest != "" {
			v, err := parseScalarOrFlow(rest)
			if err != nil {
				return nil, err
			}
			m[key] = v
			continue
		}
		// Nested block: peek next line's indent.
		if p.pos < len(p.lines) && p.lines[p.pos].indent > indent {
			child, err := p.parseBlock(p.lines[p.pos].indent)
			if err != nil {
				return nil, err
			}
			m[key] = child
		} else if p.pos < len(p.lines) && (strings.HasPrefix(p.lines[p.pos].content, "- ") || p.lines[p.pos].content == "-") && p.lines[p.pos].indent == indent {
			// Sequence at the same indent as the key belongs to the key.
			child, err := p.parseSequence(indent)
			if err != nil {
				return nil, err
			}
			m[key] = child
		} else {
			m[key] = nil
		}
	}
	return m, nil
}

func (p *parser) parseSequence(indent int) (interface{}, error) {
	var seq []interface{}
	for p.pos < len(p.lines) {
		ln := p.lines[p.pos]
		if ln.indent != indent || !(strings.HasPrefix(ln.content, "- ") || ln.content == "-") {
			break
		}
		item := strings.TrimSpace(strings.TrimPrefix(ln.content, "-"))
		if item == "" {
			// Item is a nested block on following, more-indented lines.
			p.pos++
			if p.pos < len(p.lines) && p.lines[p.pos].indent > indent {
				child, err := p.parseBlock(p.lines[p.pos].indent)
				if err != nil {
					return nil, err
				}
				seq = append(seq, child)
			} else {
				seq = append(seq, nil)
			}
			continue
		}
		// Inline item: either "key: val" (start of a mapping) or a scalar.
		if key, rest, ok := splitKey(item); ok {
			// Mapping item. Build it from this inline pair plus any deeper lines.
			mp := map[string]interface{}{}
			if rest != "" {
				v, err := parseScalarOrFlow(rest)
				if err != nil {
					return nil, err
				}
				mp[key] = v
			}
			p.pos++
			// Continuation lines indented deeper than the dash position.
			contIndent := indent + 2
			for p.pos < len(p.lines) && p.lines[p.pos].indent >= contIndent &&
				!(strings.HasPrefix(p.lines[p.pos].content, "- ") && p.lines[p.pos].indent == indent) {
				cln := p.lines[p.pos]
				ckey, crest, cok := splitKey(cln.content)
				if !cok {
					return nil, fmt.Errorf("miniyaml: expected key in sequence mapping at %q", cln.raw)
				}
				if crest != "" {
					v, err := parseScalarOrFlow(crest)
					if err != nil {
						return nil, err
					}
					mp[ckey] = v
					p.pos++
				} else {
					p.pos++
					if p.pos < len(p.lines) && p.lines[p.pos].indent > cln.indent {
						child, err := p.parseBlock(p.lines[p.pos].indent)
						if err != nil {
							return nil, err
						}
						mp[ckey] = child
					} else {
						mp[ckey] = nil
					}
				}
			}
			seq = append(seq, mp)
			continue
		}
		v, err := parseScalarOrFlow(item)
		if err != nil {
			return nil, err
		}
		seq = append(seq, v)
		p.pos++
	}
	return seq, nil
}

// splitKey splits "key: rest" returning key, rest (trimmed), ok.
func splitKey(s string) (string, string, bool) {
	idx := indexColon(s)
	if idx < 0 {
		return "", "", false
	}
	key := strings.TrimSpace(s[:idx])
	rest := strings.TrimSpace(s[idx+1:])
	key = unquote(key)
	if key == "" {
		return "", "", false
	}
	return key, rest, true
}

// indexColon finds the first ": " or trailing ":" not inside quotes/brackets.
func indexColon(s string) int {
	depth := 0
	var quote rune
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
		case r == ':' && depth == 0:
			if i == len(s)-1 || s[i+1] == ' ' {
				return i
			}
		}
	}
	return -1
}

// parseScalarOrFlow parses a scalar value or a flow sequence/mapping.
