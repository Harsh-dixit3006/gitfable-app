package middleware

import (
	"net/http"

	"github.com/nishantg96/gitfable/internal/handler"
)

const MaxRequestSize = 1 << 20 // 1MB

func LimitRequestSize(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.ContentLength > MaxRequestSize {
			handler.Error(w, http.StatusRequestEntityTooLarge, handler.ErrCodeTooLarge, "Request body too large")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, MaxRequestSize)
		next.ServeHTTP(w, r)
	})
}
