package kirocli

import (
	"context"
	"encoding/json"
	"sync"
	"time"
)

// Model is one model kiro-cli can run for the signed-in account.
type Model struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Description    string  `json:"description,omitempty"`
	ContextWindow  int     `json:"contextWindow,omitempty"`
	RateMultiplier float64 `json:"rateMultiplier,omitempty"`
}

// ModelList is the account's model catalog. Problem explains why only the
// fallback ("auto") is listed when kiro-cli could not provide the real list.
type ModelList struct {
	Models  []Model  `json:"models"`
	Default string   `json:"default"`
	Problem *Problem `json:"problem,omitempty"`
}

const (
	modelsTimeout = 20 * time.Second
	modelsTTL     = 10 * time.Minute
)

// modelCatalog caches a successful model list; failures are not cached, so
// signing in or reconnecting fixes the list on the next request.
type modelCatalog struct {
	mu      sync.Mutex
	cached  *ModelList
	fetched time.Time
}

func (c *modelCatalog) get(r *Runner, refresh bool) ModelList {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !refresh && c.cached != nil && time.Since(c.fetched) < modelsTTL {
		return *c.cached
	}
	res, p := r.Run(context.Background(), modelsTimeout, "chat", "--list-models", "--format", "json")
	if p != nil {
		return fallback(p)
	}
	list, ok := parseModelList(res.Stdout)
	if !ok {
		return fallback(problem(Failed, string(res.Stdout)))
	}
	c.cached, c.fetched = &list, time.Now()
	return list
}

// fallback lists only "auto", which every account can use.
func fallback(p *Problem) ModelList {
	return ModelList{Models: []Model{{ID: "auto", Name: "auto"}}, Default: "auto", Problem: p}
}

// parseModelList decodes `kiro-cli chat --list-models --format json`.
func parseModelList(raw []byte) (ModelList, bool) {
	var out struct {
		Models []struct {
			ID             string  `json:"model_id"`
			Name           string  `json:"model_name"`
			Description    string  `json:"description"`
			ContextWindow  int     `json:"context_window_tokens"`
			RateMultiplier float64 `json:"rate_multiplier"`
		} `json:"models"`
		Default string `json:"default_model"`
	}
	if json.Unmarshal(raw, &out) != nil {
		return ModelList{}, false
	}
	list := ModelList{Default: out.Default}
	for _, m := range out.Models {
		if m.ID != "" {
			list.Models = append(list.Models, Model{ID: m.ID, Name: m.Name, Description: m.Description, ContextWindow: m.ContextWindow, RateMultiplier: m.RateMultiplier})
		}
	}
	return list, len(list.Models) > 0
}
