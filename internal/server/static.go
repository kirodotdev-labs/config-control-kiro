package server

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io/fs"
	"net/http"
	"strings"
)

// spaHandler serves the embedded single-page app. Asset requests are served
// as files; every other GET returns index.html with the session token injected
// in a nonce-protected script and a strict Content-Security-Policy.
func spaHandler(webFS fs.FS, token string) (http.Handler, error) {
	index, err := fs.ReadFile(webFS, "index.html")
	if err != nil {
		return nil, fmt.Errorf("embedded index.html missing: %w", err)
	}
	files := http.FileServer(http.FS(webFS))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.URL.Path != "/" && fileExists(webFS, strings.TrimPrefix(r.URL.Path, "/")) {
			files.ServeHTTP(w, r)
			return
		}
		nonce, err := newNonce()
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		script := fmt.Sprintf(`<script nonce="%s">window.__CCKIRO_TOKEN__=%q;</script>`, nonce, token)
		page := strings.Replace(string(index), "<head>", "<head>"+script, 1)
		h := w.Header()
		h.Set("Content-Type", "text/html; charset=utf-8")
		h.Set("Cache-Control", "no-store")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Content-Security-Policy", contentSecurityPolicy(nonce))
		_, _ = w.Write([]byte(page))
	}), nil
}

// contentSecurityPolicy allows only same-origin resources plus the one
// nonce-tagged inline script that carries the session token.
func contentSecurityPolicy(nonce string) string {
	return strings.Join([]string{
		"default-src 'self'",
		"script-src 'self' 'nonce-" + nonce + "'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data:",
		"font-src 'self' data:",
		"connect-src 'self'",
		"object-src 'none'",
		"base-uri 'none'",
		"frame-ancestors 'none'",
		"form-action 'self'",
	}, "; ")
}

// fileExists reports whether name is a regular file in fsys.
func fileExists(fsys fs.FS, name string) bool {
	info, err := fs.Stat(fsys, name)
	return err == nil && !info.IsDir()
}

// newNonce returns a random base64 CSP nonce.
func newNonce() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(b), nil
}
