package agent

import (
	"bytes"
	"fmt"
	"strings"

	"kiromanager/internal/shared/miniyaml"
	"kiromanager/internal/shared/ordered"
)

const fence = "---"

// parseMarkdown splits a "---" YAML frontmatter block from the prompt body.
// Unsupported frontmatter is kept verbatim (see document.frontLocked).
func parseMarkdown(src string) (*document, error) {
	doc := &document{format: formatMarkdown, fields: ordered.New()}
	front, body, ok := splitFrontmatter(src)
	if !ok {
		doc.body = src
		return doc, nil
	}
	doc.body, doc.frontText = body, front
	m, err := miniyaml.Decode(front)
	if err != nil {
		doc.frontLocked = true
		return doc, nil
	}
	fields, err := ordered.FromMap(miniyaml.TopLevelKeys(front), m)
	if err != nil {
		return nil, err
	}
	sig, err := fields.MarshalJSON()
	if err != nil {
		return nil, err
	}
	doc.fields, doc.frontSig = fields, string(sig)
	return doc, nil
}

// splitFrontmatter returns (frontmatter, body, true) when src starts with a
// fenced block, otherwise ok is false.
func splitFrontmatter(src string) (string, string, bool) {
	s := strings.TrimPrefix(src, "\ufeff")
	if !strings.HasPrefix(s, fence+"\n") && !strings.HasPrefix(s, fence+"\r\n") {
		return "", "", false
	}
	rest := s[strings.Index(s, "\n")+1:]
	for i, off := 0, 0; ; i++ {
		nl := strings.Index(rest[off:], "\n")
		lineEnd := len(rest)
		if nl >= 0 {
			lineEnd = off + nl
		}
		if strings.TrimRight(rest[off:lineEnd], "\r") == fence {
			body := ""
			if lineEnd < len(rest) {
				body = strings.TrimPrefix(rest[lineEnd+1:], "\n")
			}
			return rest[:off], body, true
		}
		if nl < 0 {
			return "", "", false
		}
		off = lineEnd + 1
	}
}

// encodeMarkdown writes frontmatter (in original key order) and the body.
func encodeMarkdown(d *document) ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteString(fence + "\n")
	sig, err := d.fields.MarshalJSON()
	if err != nil {
		return nil, err
	}
	switch {
	case d.frontLocked || (d.frontText != "" && string(sig) == d.frontSig):
		buf.WriteString(d.frontText)
	case d.fields.Len() > 0:
		m, err := d.fields.ToMap()
		if err != nil {
			return nil, err
		}
		y, err := miniyaml.EncodeOrdered(d.fields.Keys(), m)
		if err != nil {
			return nil, fmt.Errorf("value cannot be written as YAML frontmatter: %w", err)
		}
		buf.WriteString(y)
	}
	buf.WriteString(fence + "\n")
	if d.body != "" {
		buf.WriteString(d.body)
		if !strings.HasSuffix(d.body, "\n") {
			buf.WriteByte('\n')
		}
	}
	return buf.Bytes(), nil
}
