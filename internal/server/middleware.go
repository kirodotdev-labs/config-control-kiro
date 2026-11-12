package server

import (
	"crypto/subtle"
	"net/http"
	"time"

	"kiromanager/internal/shared/utils"
)

// maxBodyBytes caps request bodies to protect the server from oversized uploads.
const maxBodyBytes = 10 << 20 // 10 MiB

// chain applies middlewares so the first listed runs outermost.
func chain(h http.Handler, mws ...func(http.Handler) http.Handler) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}

// securityHeaders sets defensive headers on every API response.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// requireToken rejects API requests that do not carry the session bearer
// token. The comparison is constant-time to avoid timing side channels.
func requireToken(token string) func(http.Handler) http.Handler {
	want := []byte("Bearer " + token)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			got := []byte(r.Header.Get("Authorization"))
			if subtle.ConstantTimeCompare(got, want) != 1 {
				utils.RespondError(w, utils.NewAppError("unauthorized", http.StatusUnauthorized, "UNAUTHORIZED"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// limitBody caps the request body size.
func limitBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
		next.ServeHTTP(w, r)
	})
}

// recoverPanics turns a handler panic into a 500 instead of killing the server.
func recoverPanics(logger *utils.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if v := recover(); v != nil {
					logger.Error("panic serving %s %s: %v", r.Method, r.URL.Path, v)
					utils.RespondError(w, utils.NewAppError("internal error", http.StatusInternalServerError, "INTERNAL_ERROR"))
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// logRequests logs method, path, status and duration for each request.
func logRequests(logger *utils.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)
			logger.Info("%s %s %d %v", r.Method, r.URL.Path, rec.status, time.Since(start))
		})
	}
}

// statusRecorder captures the response status code for logging.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

// WriteHeader records code and forwards it.
func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}
