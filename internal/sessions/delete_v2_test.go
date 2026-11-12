package sessions

import (
	"strings"
	"testing"
)

func TestEmptyChats(t *testing.T) {
	s, _ := setup(t)
	empty := map[string]bool{}
	for _, x := range s.Overview(false, "").Sessions {
		if x.Empty {
			empty[x.ID] = true
		}
		if x.Tags == nil {
			t.Fatal("tags is always a list")
		}
	}
	if len(empty) != 3 || !empty["eeee-6"] || !empty["ffff-7"] || !empty["sess_gggg8"] {
		t.Errorf("empty: %v", empty)
	}
	deleted = nil
	res, err := s.Delete([]string{"eeee-6", "ffff-7", "sess_gggg8", "aaaa-1", "zzzz-9"}, true)
	if err != nil || len(res.Deleted) != 2 || len(deleted) != 2 || deleted[0] != "eeee-6" || deleted[1] != "ffff-7" {
		t.Fatalf("delete: %+v %v %v", res, deleted, err)
	}
	if !strings.Contains(res.Skipped["sess_gggg8"], "V3") || !strings.Contains(res.Skipped["aaaa-1"], "messages") || res.Skipped["zzzz-9"] == "" {
		t.Errorf("skipped: %v", res.Skipped)
	}
	if _, err := s.Delete(nil, false); err == nil {
		t.Error("nothing to delete is an error")
	}
	_, _ = s.SetTags("dddd-5", []string{"keep"})
	deleted = nil
	res, _ = s.Delete([]string{"dddd-5", "aaaa-1", "sess_bbbb3"}, false)
	if strings.Join(res.Deleted, ",") != "dddd-5" || !strings.Contains(res.Skipped["aaaa-1"], "open") || !strings.Contains(res.Skipped["sess_bbbb3"], "V3") {
		t.Errorf("delete any chat: %+v", res)
	}
	if tags := s.tags.all(); len(tags["dddd-5"]) != 0 {
		t.Error("a deleted chat's tags are removed")
	}
}
