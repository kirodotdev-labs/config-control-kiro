package sessions

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"

	"kiromanager/internal/shared/utils"
)

// Tags are the app's own labels for chats, kept in
// <global>/kiroui/chat-tags.json beside the app's other files. Kiro's chats
// are never modified.
type tagStore struct {
	mu   sync.Mutex
	path func() string
}

type tagFile struct {
	Version int                 `json:"version"`
	Chats   map[string][]string `json:"chats"`
}

const (
	maxTags   = 20
	maxTagLen = 40
)

var tagChars = regexp.MustCompile(`[^a-z0-9._-]+`)

// normalizeTag turns "#Client X" into "client-x"; "" means not a usable tag.
func normalizeTag(t string) string {
	t = strings.ToLower(strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(t), "#")))
	t = tagChars.ReplaceAllString(strings.Join(strings.Fields(t), "-"), "")
	t = strings.Trim(t, "-.")
	if r := []rune(t); len(r) > maxTagLen {
		t = string(r[:maxTagLen])
	}
	return t
}

// cleanTags normalizes, de-duplicates and sorts tags.
func cleanTags(in []string) ([]string, error) {
	seen := map[string]bool{}
	out := []string{}
	for _, t := range in {
		if n := normalizeTag(t); n != "" && !seen[n] {
			seen[n] = true
			out = append(out, n)
		}
	}
	if len(out) > maxTags {
		return nil, utils.BadRequest("A chat can have up to 20 tags.", "TOO_MANY_TAGS")
	}
	sort.Strings(out)
	return out, nil
}

func (t *tagStore) load() tagFile {
	f := tagFile{Version: 1, Chats: map[string][]string{}}
	data, err := os.ReadFile(t.path())
	if err != nil {
		return f
	}
	if json.Unmarshal(data, &f) != nil || f.Chats == nil {
		return tagFile{Version: 1, Chats: map[string][]string{}}
	}
	return f
}

func (t *tagStore) save(f tagFile) error {
	for id, tags := range f.Chats {
		if len(tags) == 0 {
			delete(f.Chats, id)
		}
	}
	data, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return err
	}
	return utils.WriteFileAtomic(t.path(), append(data, '\n'))
}

// all returns every chat's tags.
func (t *tagStore) all() map[string][]string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.load().Chats
}

// set replaces one chat's tags and returns them cleaned.
func (t *tagStore) set(id string, tags []string) ([]string, error) {
	if !validID(id) {
		return nil, utils.BadRequest("That isn't a valid chat id.", "INVALID_CHAT")
	}
	clean, err := cleanTags(tags)
	if err != nil {
		return nil, err
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	f := t.load()
	f.Chats[id] = clean
	return clean, t.save(f)
}

// rename changes a tag on every chat; an empty to removes it everywhere.
func (t *tagStore) rename(from, to string) error {
	from, to = normalizeTag(from), normalizeTag(to)
	if from == "" {
		return utils.BadRequest("Choose a tag to change.", "INVALID_TAG")
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	f := t.load()
	for id, tags := range f.Chats {
		next := []string{}
		for _, x := range tags {
			if x == from {
				x = to
			}
			if x != "" {
				next = append(next, x)
			}
		}
		next, _ = cleanTags(next)
		f.Chats[id] = next
	}
	return t.save(f)
}

// forget drops the tags of chats that were deleted.
func (t *tagStore) forget(ids []string) error {
	t.mu.Lock()
	defer t.mu.Unlock()
	f := t.load()
	n := len(f.Chats)
	for _, id := range ids {
		delete(f.Chats, id)
	}
	if len(f.Chats) == n {
		return nil
	}
	err := t.save(f)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func tagsPath(kiroHome func() string) func() string {
	return func() string { return filepath.Join(kiroHome(), "kiroui", "chat-tags.json") }
}

// SetTags replaces one chat's tags.
func (s *Service) SetTags(id string, tags []string) ([]string, error) { return s.tags.set(id, tags) }

// RenameTag changes a tag on every chat; an empty to deletes it.
func (s *Service) RenameTag(from, to string) error { return s.tags.rename(from, to) }
