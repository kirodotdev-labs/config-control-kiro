package update

import "testing"

func TestNewer(t *testing.T) {
	cases := []struct {
		candidate, current string
		want               bool
		desc               string
	}{
		{"1.1.0", "1.0.0", true, "minor bump is newer"},
		{"1.0.1", "1.0.0", true, "patch bump is newer"},
		{"2.0.0", "1.9.9", true, "major bump beats high minor/patch"},
		{"1.10.0", "1.9.0", true, "two-digit minor beats single-digit"},

		{"1.0.0", "1.1.0", false, "older minor is not newer"},
		{"1.0.0", "1.0.0", false, "same version is not newer"},
		{"1.0.0", "1.1.0", false, "the bug case: latest=1.0.0 current=1.1.0"},
		{"0.9.0", "1.0.0", false, "older major is not newer"},

		{"1.1", "1.0.0", true, "missing patch component still works"},
		{"1.1.0", "1.1", false, "trailing zero counts as equal"},

		{"", "1.0.0", false, "empty candidate is not newer"},
		{"1.0.0", "", false, "empty current is not newer"},
		{"1.0.0", "dev", false, "dev current never gets an update"},
		{"abc", "1.0.0", false, "non-numeric candidate falls back safely"},
	}
	for _, tc := range cases {
		got := Newer(tc.candidate, tc.current)
		if got != tc.want {
			t.Errorf("%s: Newer(%q, %q) = %v, want %v",
				tc.desc, tc.candidate, tc.current, got, tc.want)
		}
	}
}
