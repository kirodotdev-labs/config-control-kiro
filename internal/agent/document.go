package agent

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"kiromanager/internal/shared/ordered"
	"kiromanager/internal/shared/utils"
)

// format is an agent spec's on-disk encoding.
type format string

const (
	formatJSON     format = "json"
	formatMarkdown format = "md"
)

// promptKey is the field that holds the system prompt. For markdown specs the
// prompt is the document body rather than a frontmatter key.
const promptKey = "prompt"

// document is one agent spec exactly as stored. The API exposes it as a single
// ordered JSON object (its "view"); saving writes that view back in the same
// format and key order, so unknown and V3 fields always round-trip.
type document struct {
	format format
	fields *ordered.Object // JSON object, or parsed YAML frontmatter
	body   string          // markdown body (the prompt)
	// frontText is the frontmatter exactly as read. It is re-emitted verbatim
	// while the fields are unchanged, so editing only the prompt never
	// reformats the YAML. frontSig is the fields' canonical JSON at read time.
	frontText string
	frontSig  string
	// frontLocked marks frontmatter using YAML the parser does not support:
	// it is preserved verbatim and only the body is editable.
	frontLocked bool
}

// formatOf returns the spec format for a file name.
func formatOf(name string) format {
	if strings.EqualFold(filepath.Ext(name), ".md") {
		return formatMarkdown
	}
	return formatJSON
}

// readDocument loads and parses the spec at path.
func readDocument(path string) (*document, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if formatOf(path) == formatMarkdown {
		return parseMarkdown(string(data))
	}
	fields := ordered.New()
	if err := fields.UnmarshalJSON(data); err != nil {
		return nil, fmt.Errorf("invalid agent JSON in %s: %w", filepath.Base(path), err)
	}
	return &document{format: formatJSON, fields: fields}, nil
}

// view returns the document as one ordered object. For markdown the body is
// exposed as "prompt" (unless the frontmatter defines prompt itself).
func (d *document) view() (*ordered.Object, error) {
	if d.format == formatJSON {
		return d.fields, nil
	}
	v := ordered.New()
	for _, k := range d.fields.Keys() {
		raw, _ := d.fields.Raw(k)
		v.SetRaw(k, raw)
	}
	if !v.Has(promptKey) && strings.TrimSpace(d.body) != "" {
		if err := v.Set(promptKey, d.body); err != nil {
			return nil, err
		}
	}
	return v, nil
}

// apply replaces the document contents with view (the complete edited spec).
// Fields absent from view are removed, so deletions in the editor persist.
func (d *document) apply(view *ordered.Object) error {
	if d.format == formatJSON {
		d.fields = view
		return nil
	}
	fields := ordered.New()
	for _, k := range view.Keys() {
		raw, _ := view.Raw(k)
		if k == promptKey {
			var s string
			if ok, err := view.Get(k, &s); ok && err == nil {
				d.body = s
				continue
			}
		}
		fields.SetRaw(k, raw)
	}
	if !view.Has(promptKey) {
		d.body = ""
	}
	if !d.frontLocked {
		d.fields = fields
	}
	return nil
}

// signature returns the canonical JSON of the document's view, used to detect
// whether an update actually changes anything.
func (d *document) signature() (string, error) {
	v, err := d.view()
	if err != nil {
		return "", err
	}
	b, err := v.MarshalJSON()
	return string(b), err
}

// encode serialises the document in its own format.
func (d *document) encode() ([]byte, error) {
	if d.format == formatMarkdown {
		return encodeMarkdown(d)
	}
	return d.fields.Pretty()
}

// write saves the document to path atomically (temp file + rename) so a crash
// mid-write can never leave a truncated spec that kiro-cli would reject.
func (d *document) write(path string) error {
	data, err := d.encode()
	if err != nil {
		return err
	}
	return utils.WriteFileAtomic(path, data)
}
