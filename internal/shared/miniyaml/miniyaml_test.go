package miniyaml

import (
	"reflect"
	"strings"
	"testing"
)

func TestDecodePermissionsRules(t *testing.T) {
	doc := `rules:
  - capability: shell
    match: ["git *", "npm *"]
    effect: allow
  - capability: fs_write
    match:
      - src/**
    exclude:
      - "*.lock"
    effect: deny
`
	m, err := Decode(doc)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	rules, ok := m["rules"].([]interface{})
	if !ok || len(rules) != 2 {
		t.Fatalf("expected 2 rules, got %v", m["rules"])
	}
	r0 := rules[0].(map[string]interface{})
	if r0["capability"] != "shell" || r0["effect"] != "allow" {
		t.Errorf("rule0 fields wrong: %v", r0)
	}
	match0, ok := r0["match"].([]interface{})
	if !ok || len(match0) != 2 || match0[0] != "git *" {
		t.Errorf("rule0 match wrong: %v", r0["match"])
	}
	r1 := rules[1].(map[string]interface{})
	if r1["effect"] != "deny" {
		t.Errorf("rule1 effect wrong: %v", r1)
	}
	ex, ok := r1["exclude"].([]interface{})
	if !ok || len(ex) != 1 || ex[0] != "*.lock" {
		t.Errorf("rule1 exclude wrong: %v", r1["exclude"])
	}
}

func TestRoundTripPreservesUnknownTopKey(t *testing.T) {
	doc := `version: v1
rules:
  - capability: shell
    effect: allow
customExtension:
  keep: me
`
	m, err := Decode(doc)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	// Mutate rules only.
	m["rules"] = []interface{}{
		map[string]interface{}{"capability": "fs_read", "effect": "allow"},
	}
	out, err := EncodeOrdered(nil, m)
	if err != nil {
		t.Fatalf("Encode: %v", err)
	}
	m2, err := Decode(out)
	if err != nil {
		t.Fatalf("re-Decode: %v", err)
	}
	if m2["version"] != "v1" {
		t.Errorf("version lost: %v", m2["version"])
	}
	ce, ok := m2["customExtension"].(map[string]interface{})
	if !ok || ce["keep"] != "me" {
		t.Errorf("unknown top key customExtension not preserved: %v", m2["customExtension"])
	}
}

func TestScalarTypes(t *testing.T) {
	doc := `str: hello
num: 42
flag: true
quoted: "quoted value"
`
	m, err := Decode(doc)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	want := map[string]interface{}{
		"str":    "hello",
		"num":    42,
		"flag":   true,
		"quoted": "quoted value",
	}
	for k, v := range want {
		if !reflect.DeepEqual(m[k], v) {
			t.Errorf("key %s = %v (%T), want %v (%T)", k, m[k], m[k], v, v)
		}
	}
}

func TestTopLevelKeysAndEncodeOrdered(t *testing.T) {
	src := "name: a\nzeta: 1\nlist:\n  - x\nnested:\n  inner: 2\nalpha: true\n"
	keys := TopLevelKeys(src)
	if strings.Join(keys, ",") != "name,zeta,list,nested,alpha" {
		t.Fatalf("keys %v", keys)
	}
	m, err := Decode(src)
	if err != nil {
		t.Fatal(err)
	}
	out, err := EncodeOrdered(keys, m)
	if err != nil {
		t.Fatal(err)
	}
	if idx := strings.Index(out, "zeta:"); idx < 0 || idx > strings.Index(out, "alpha:") {
		t.Errorf("order not preserved:\n%s", out)
	}
	back, err := Decode(out)
	if err != nil || len(back) != len(m) {
		t.Errorf("re-decode: %v %v", back, err)
	}
}

func TestEncodeDecodeRoundTripNestedSequences(t *testing.T) {
	m := map[string]any{"rules": []any{
		map[string]any{"capability": "shell", "effect": "allow", "match": []any{"git *"}},
		map[string]any{"capability": "fs_write", "effect": "deny", "match": []any{"src/**"}, "exclude": []any{"*.lock"}},
	}}
	out, err := EncodeOrdered(nil, m)
	if err != nil {
		t.Fatal(err)
	}
	back, err := Decode(out)
	if err != nil {
		t.Fatalf("encoder output must be decodable:\n%s\nerr: %v", out, err)
	}
	rules, _ := back["rules"].([]any)
	if len(rules) != 2 {
		t.Fatalf("rules lost: %v", back)
	}
	if ex, _ := rules[1].(map[string]any)["exclude"].([]any); len(ex) != 1 || ex[0] != "*.lock" {
		t.Errorf("nested list lost: %v", rules[1])
	}
}

func TestEmptyListRoundTrips(t *testing.T) {
	out, err := EncodeOrdered([]string{"rules"}, map[string]any{"rules": []any{}})
	if err != nil || out != "rules: []\n" {
		t.Fatalf("encode: %q %v", out, err)
	}
	m, err := Decode(out)
	if list, ok := m["rules"].([]any); err != nil || !ok || len(list) != 0 {
		t.Errorf("decode: %#v %v", m, err)
	}
}
