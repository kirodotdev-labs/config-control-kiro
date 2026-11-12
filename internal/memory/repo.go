package memory

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// providers maps a git host to the provider name Kiro puts in a repository
// scope (Kiro's agent code, for its supported hosts).
var providers = map[string]string{
	"github.com":     "github",
	"gitlab.com":     "gitlab",
	"bitbucket.org":  "bitbucket",
	"git.amazon.com": "gitfarm",
}

// repoScope returns the memory scope Kiro gives the git repository in dir,
// "repo:<provider>/<owner>/<name>", from its origin remote. It answers ""
// when there's no origin or the host isn't one Kiro names.
func repoScope(dir string) string {
	data, err := os.ReadFile(filepath.Join(dir, ".git", "config"))
	if err != nil {
		return ""
	}
	host, path := splitRemote(originURL(string(data)))
	if host == "" {
		return ""
	}
	path = strings.TrimSuffix(strings.Trim(path, "/"), ".git")
	provider := providers[host]
	if strings.HasSuffix(host, ".git.amazon.com") {
		provider = "gitfarm"
	}
	switch provider {
	case "gitfarm":
		// pkg/<name>, else the last path part.
		name := path[strings.LastIndex(path, "/")+1:]
		if rest, ok := strings.CutPrefix(path, "pkg/"); ok {
			name = rest
		}
		if name == "" {
			return ""
		}
		return "repo:gitfarm/gitfarm/" + name
	case "github":
		if owner, name, ok := strings.Cut(path, "/"); ok && owner != "" && name != "" {
			return "repo:github/" + owner + "/" + name
		}
	case "gitlab":
		if i := strings.LastIndex(path, "/"); i > 0 {
			return "repo:gitlab/" + path[:i] + "/" + path[i+1:]
		}
	case "bitbucket":
		parts := strings.Split(path, "/")
		if len(parts) >= 2 && parts[0] != "" && parts[1] != "" {
			return "repo:bitbucket/" + parts[0] + "/" + parts[1]
		}
	}
	return ""
}

// originURL returns the url of [remote "origin"] in a git config.
func originURL(config string) string {
	in := false
	for _, line := range strings.Split(config, "\n") {
		t := strings.TrimSpace(line)
		if t == `[remote "origin"]` {
			in = true
			continue
		}
		if in && strings.HasPrefix(t, "[") {
			break
		}
		if in {
			if k, v, ok := strings.Cut(t, "="); ok && strings.TrimSpace(k) == "url" {
				return strings.TrimSpace(v)
			}
		}
	}
	return ""
}

// splitRemote returns the lower-case host and the path of a git remote,
// written as a URL (https://host/path, ssh://user@host:22/path) or in scp
// form (user@host:path).
func splitRemote(remote string) (host, path string) {
	if remote == "" {
		return "", ""
	}
	if strings.Contains(remote, "://") {
		u, err := url.Parse(remote)
		if err != nil {
			return "", ""
		}
		return strings.ToLower(u.Hostname()), u.Path
	}
	at := strings.LastIndex(remote, "@")
	rest := remote[at+1:]
	h, p, ok := strings.Cut(rest, ":")
	if !ok {
		return "", ""
	}
	return strings.ToLower(h), p
}
