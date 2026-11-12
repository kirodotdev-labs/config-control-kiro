// Package ordered provides a JSON object that remembers its key order.
//
// Config files are hand-edited by users; rewriting them with Go maps would
// sort every key alphabetically. Object keeps top-level keys in their original
// order and stores each value as raw JSON, so untouched values round-trip
// byte-for-byte and new keys are appended at the end.
package ordered

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// Object is an insertion-ordered JSON object.
type Object struct {
	keys []string
	vals map[string]json.RawMessage
}

// New returns an empty Object.
func New() *Object { return &Object{vals: map[string]json.RawMessage{}} }

// Keys returns the keys in order.
func (o *Object) Keys() []string { return append([]string(nil), o.keys...) }

// Len returns the number of keys.
func (o *Object) Len() int { return len(o.keys) }

// Has reports whether key is present.
func (o *Object) Has(key string) bool { _, ok := o.vals[key]; return ok }

// Raw returns the raw JSON value for key.
func (o *Object) Raw(key string) (json.RawMessage, bool) {
	v, ok := o.vals[key]
	return v, ok
}

// Get decodes the value for key into v. It reports false if key is absent.
func (o *Object) Get(key string, v any) (bool, error) {
	raw, ok := o.vals[key]
	if !ok {
		return false, nil
	}
	return true, json.Unmarshal(raw, v)
}

// String returns the value for key if it is a JSON string, else "".
func (o *Object) String(key string) string {
	var s string
	if ok, err := o.Get(key, &s); !ok || err != nil {
		return ""
	}
	return s
}

// Set encodes v and stores it under key, appending key if new.
func (o *Object) Set(key string, v any) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("encode %q: %w", key, err)
	}
	o.SetRaw(key, raw)
	return nil
}

// SetRaw stores raw JSON under key, appending key if new.
func (o *Object) SetRaw(key string, raw json.RawMessage) {
	if o.vals == nil {
		o.vals = map[string]json.RawMessage{}
	}
	if _, ok := o.vals[key]; !ok {
		o.keys = append(o.keys, key)
	}
	o.vals[key] = append(json.RawMessage(nil), raw...)
}

// Delete removes key if present.
func (o *Object) Delete(key string) {
	if _, ok := o.vals[key]; !ok {
		return
	}
	delete(o.vals, key)
	for i, k := range o.keys {
		if k == key {
			o.keys = append(o.keys[:i], o.keys[i+1:]...)
			return
		}
	}
}

// UnmarshalJSON parses a JSON object, keeping key order. A repeated key keeps
// its first position and its last value (matching encoding/json semantics).
func (o *Object) UnmarshalJSON(data []byte) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	tok, err := dec.Token()
	if err != nil {
		return err
	}
	if d, ok := tok.(json.Delim); !ok || d != '{' {
		return fmt.Errorf("expected a JSON object")
	}
	*o = Object{vals: map[string]json.RawMessage{}}
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			return err
		}
		key, _ := tok.(string)
		var raw json.RawMessage
		if err := dec.Decode(&raw); err != nil {
			return err
		}
		o.SetRaw(key, raw)
	}
	_, err = dec.Token() // closing '}'
	return err
}

// MarshalJSON writes the object compactly with keys in order.
func (o *Object) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, k := range o.keys {
		if i > 0 {
			buf.WriteByte(',')
		}
		kb, _ := json.Marshal(k)
		buf.Write(kb)
		buf.WriteByte(':')
		if err := json.Compact(&buf, o.vals[k]); err != nil {
			return nil, fmt.Errorf("value for %q: %w", k, err)
		}
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

// Pretty returns the object indented with two spaces and a trailing newline.
func (o *Object) Pretty() ([]byte, error) {
	compact, err := o.MarshalJSON()
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := json.Indent(&buf, compact, "", "  "); err != nil {
		return nil, err
	}
	buf.WriteByte('\n')
	return buf.Bytes(), nil
}

// FromMap builds an Object from m using the given key order. Keys missing
// from order are appended (in the order supplied by extra).
func FromMap(order []string, m map[string]any) (*Object, error) {
	o := New()
	for _, k := range order {
		if v, ok := m[k]; ok {
			if err := o.Set(k, v); err != nil {
				return nil, err
			}
		}
	}
	for k, v := range m {
		if !o.Has(k) {
			if err := o.Set(k, v); err != nil {
				return nil, err
			}
		}
	}
	return o, nil
}

// ToMap decodes every value into a generic map (order is lost).
func (o *Object) ToMap() (map[string]any, error) {
	m := make(map[string]any, len(o.keys))
	for _, k := range o.keys {
		var v any
		if err := json.Unmarshal(o.vals[k], &v); err != nil {
			return nil, err
		}
		m[k] = v
	}
	return m, nil
}
