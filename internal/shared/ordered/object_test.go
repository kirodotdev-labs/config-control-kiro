package ordered

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestRoundTripPreservesOrder(t *testing.T) {
	in := `{"name":"a","zeta":1,"alpha":{"y":2,"x":1},"tools":["b","a"]}`
	var o Object
	if err := json.Unmarshal([]byte(in), &o); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(o.Keys(), ","); got != "name,zeta,alpha,tools" {
		t.Errorf("keys %q", got)
	}
	out, err := json.Marshal(&o)
	if err != nil || string(out) != in {
		t.Errorf("round trip changed document:\n in=%s\nout=%s err=%v", in, out, err)
	}
}

func TestSetAppendsAndDeleteRemoves(t *testing.T) {
	o := New()
	_ = o.Set("b", 1)
	_ = o.Set("a", 2)
	_ = o.Set("b", 3) // update keeps position
	o.Delete("missing")
	if got := strings.Join(o.Keys(), ","); got != "b,a" {
		t.Errorf("keys %q", got)
	}
	o.Delete("b")
	if o.Has("b") || o.Len() != 1 {
		t.Errorf("delete failed: %v", o.Keys())
	}
	var n int
	if ok, err := o.Get("a", &n); !ok || err != nil || n != 2 {
		t.Errorf("get a: %v %v %d", ok, err, n)
	}
}

func TestRejectsNonObject(t *testing.T) {
	for _, in := range []string{`[]`, `"x"`, `1`, `{"a":}`} {
		var o Object
		if err := json.Unmarshal([]byte(in), &o); err == nil {
			t.Errorf("%s: expected error", in)
		}
	}
}

func TestPrettyAndHelpers(t *testing.T) {
	o, err := FromMap([]string{"name", "missing"}, map[string]any{"name": "x", "extra": true})
	if err != nil {
		t.Fatal(err)
	}
	if o.Keys()[0] != "name" || o.String("name") != "x" || o.String("extra") != "" {
		t.Errorf("FromMap/String: %v", o.Keys())
	}
	p, _ := o.Pretty()
	if !strings.HasPrefix(string(p), "{\n  \"name\": \"x\"") || !strings.HasSuffix(string(p), "}\n") {
		t.Errorf("pretty: %q", p)
	}
	m, err := o.ToMap()
	if err != nil || m["extra"] != true {
		t.Errorf("ToMap: %v %v", m, err)
	}
}
