package memory

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"kiromanager/internal/kirocli"
	"kiromanager/internal/shared/utils"
)

// fakeKiro answers initialize and records the memory call's params.
func fakeKiro(got *map[string]any, fail string) kirocli.ACPPipe {
	return func(ctx context.Context, bin, dir string, args []string) (io.WriteCloser, io.Reader, func(), error) {
		inR, inW := io.Pipe()
		outR, outW := io.Pipe()
		go func() {
			dec := json.NewDecoder(inR)
			for {
				var m map[string]any
				if dec.Decode(&m) != nil {
					return
				}
				if m["method"] == "initialize" {
					_, _ = io.WriteString(outW, `{"jsonrpc":"2.0","id":1,"result":{}}`+"\n")
					continue
				}
				*got = map[string]any{"method": m["method"], "params": m["params"]}
				if fail != "" {
					_, _ = io.WriteString(outW, `{"jsonrpc":"2.0","id":2,"error":{"code":-32603,"message":"`+fail+`"}}`+"\n")
				} else {
					_, _ = io.WriteString(outW, `{"jsonrpc":"2.0","id":2,"result":{"id":"m1"}}`+"\n")
				}
			}
		}()
		return inW, outR, func() { _ = inW.Close(); _ = outW.Close() }, nil
	}
}

func TestEditorGoesThroughKiro(t *testing.T) {
	svc, _ := newTestService(t)
	var got map[string]any
	ed := NewEditor(svc.kiroService, &kirocli.Runner{Find: func() string { return "kiro-cli" }, Pipe: fakeKiro(&got, "")})
	good := Draft{Type: "SEMANTIC", Scope: "repo:github/acme/shop", Title: "seed-db-before-tests", Summary: "Seed the local DB before integration tests.", Content: "Run make seed first."}

	if err := ed.Create(good); err != nil {
		t.Fatal(err)
	}
	p, _ := got["params"].(map[string]any)
	if got["method"] != "_kiro/memory/create" || p["memoryType"] != "SEMANTIC" || p["title"] != "seed-db-before-tests" || p["scopes"].([]any)[0] != "repo:github/acme/shop" {
		t.Errorf("create sent %v", got)
	}
	if err := ed.Update("m1", good); err != nil || got["method"] != "_kiro/memory/update" || got["params"].(map[string]any)["newTitle"] != "seed-db-before-tests" || got["params"].(map[string]any)["id"] != "m1" {
		t.Errorf("update sent %v (%v)", got, err)
	}
	if err := ed.Delete("m1"); err != nil || got["method"] != "_kiro/memory/delete" {
		t.Errorf("delete sent %v (%v)", got, err)
	}

	t.Run("Kiro's checks first, nothing sent", func(t *testing.T) {
		got = nil
		for name, d := range map[string]Draft{
			"type":     {Type: "OTHER", Scope: "Global", Title: "a", Summary: "s", Content: "c"},
			"scope":    {Type: "SEMANTIC", Scope: "somewhere", Title: "a", Summary: "s", Content: "c"},
			"title":    {Type: "SEMANTIC", Scope: "Global", Title: "not a slug", Summary: "s", Content: "c"},
			"long":     {Type: "SEMANTIC", Scope: "Global", Title: strings.Repeat("a", 51), Summary: "s", Content: "c"},
			"summary":  {Type: "SEMANTIC", Scope: "Global", Title: "a", Summary: "two\nlines", Content: "c"},
			"content":  {Type: "SEMANTIC", Scope: "Global", Title: "a", Summary: "s", Content: " "},
			"too long": {Type: "SEMANTIC", Scope: "Global", Title: "a", Summary: strings.Repeat("s", 201), Content: "c"},
		} {
			var ae *utils.AppError
			if err := ed.Create(d); !errors.As(err, &ae) || ae.StatusCode != http.StatusBadRequest {
				t.Errorf("%s: %v", name, err)
			}
		}
		if got != nil {
			t.Error("an invalid memory is never sent to Kiro")
		}
	})
	t.Run("a refusal shows Kiro's reason", func(t *testing.T) {
		ed := NewEditor(svc.kiroService, &kirocli.Runner{Find: func() string { return "kiro-cli" }, Pipe: fakeKiro(&got, "Memory is not enabled.")})
		var ae *utils.AppError
		if err := ed.Delete("m1"); !errors.As(err, &ae) || ae.StatusCode != http.StatusConflict || !strings.Contains(ae.Message, "Memory is not enabled.") {
			t.Errorf("got %v", err)
		}
	})
}
