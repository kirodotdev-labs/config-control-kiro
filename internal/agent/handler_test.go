package agent

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func request(h http.HandlerFunc, method, path, name, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if name != "" {
		req.SetPathValue("name", name)
	}
	w := httptest.NewRecorder()
	h(w, req)
	return w
}

func TestHandlerCRUD(t *testing.T) {
	svc, _ := newTestService(t)
	h := NewHandler(svc)

	if w := request(h.CreateAgent, "POST", "/api/agents", "", `{"name":"a","zeta":1,"alpha":2}`); w.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	w := request(h.GetAgent, "GET", "/api/agents/a", "a", "")
	if w.Code != http.StatusOK || !strings.HasPrefix(w.Body.String(), `{"name":"a","zeta":1,"alpha":2}`) {
		t.Fatalf("get must keep key order: %d %s", w.Code, w.Body)
	}
	if w := request(h.UpdateAgent, "PUT", "/api/agents/a", "a", `{"name":"a"}`); w.Code != http.StatusOK {
		t.Fatalf("update: %d %s", w.Code, w.Body)
	}
	if w := request(h.GetAgents, "GET", "/api/agents", "", ""); !strings.Contains(w.Body.String(), `"id":"a"`) {
		t.Errorf("list: %s", w.Body)
	}
	if w := request(h.DeleteAgent, "DELETE", "/api/agents/a", "a", ""); w.Code != http.StatusNoContent {
		t.Errorf("delete: %d", w.Code)
	}
}

func TestHandlerErrors(t *testing.T) {
	svc, _ := newTestService(t)
	h := NewHandler(svc)
	cases := []struct {
		name string
		w    *httptest.ResponseRecorder
		want int
	}{
		{"get missing", request(h.GetAgent, "GET", "/", "nope", ""), http.StatusNotFound},
		{"update missing", request(h.UpdateAgent, "PUT", "/", "nope", `{}`), http.StatusNotFound},
		{"create bad json", request(h.CreateAgent, "POST", "/", "", `{bad`), http.StatusBadRequest},
		{"create array", request(h.CreateAgent, "POST", "/", "", `[]`), http.StatusBadRequest},
		{"traversal", request(h.GetAgent, "GET", "/", "../../x", ""), http.StatusNotFound},
	}
	for _, c := range cases {
		if c.w.Code != c.want {
			t.Errorf("%s: %d want %d", c.name, c.w.Code, c.want)
		}
	}
}
