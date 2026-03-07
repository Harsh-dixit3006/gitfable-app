package handler

import (
	"encoding/json"
	"net/http"
)

type Response struct {
	Data  any       `json:"data"`
	Meta  *Meta     `json:"meta,omitempty"`
	Error *APIError `json:"error"`
}

type Meta struct {
	NextCursor string `json:"next_cursor,omitempty"`
	HasMore    bool   `json:"has_more"`
}

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

const (
	ErrCodeBadRequest       = "BAD_REQUEST"
	ErrCodeUnauthorized     = "UNAUTHORIZED"
	ErrCodeForbidden        = "FORBIDDEN"
	ErrCodeNotFound         = "NOT_FOUND"
	ErrCodeConflict         = "CONFLICT"
	ErrCodeRateLimited      = "RATE_LIMITED"
	ErrCodeTooLarge         = "REQUEST_TOO_LARGE"
	ErrCodeInternal         = "INTERNAL_ERROR"
	ErrCodeDrawLimitReached = "DRAW_LIMIT_REACHED"
	ErrCodeInvalidStatus    = "INVALID_STATUS_TRANSITION"
	ErrCodeBookmarkExists   = "BOOKMARK_EXISTS"
	ErrCodeInvalidPRURL     = "INVALID_PR_URL"
	ErrCodePRNotMerged      = "PR_NOT_MERGED"
	ErrCodeUserDisabled     = "USER_DISABLED"
	ErrCodeUsernameTaken    = "USERNAME_TAKEN"
	ErrCodeEmailTaken       = "EMAIL_TAKEN"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func OK(w http.ResponseWriter, data any) {
	writeJSON(w, http.StatusOK, Response{Data: data})
}

func Created(w http.ResponseWriter, data any) {
	writeJSON(w, http.StatusCreated, Response{Data: data})
}

func OKList(w http.ResponseWriter, data any, nextCursor string, hasMore bool) {
	writeJSON(w, http.StatusOK, Response{
		Data: data,
		Meta: &Meta{NextCursor: nextCursor, HasMore: hasMore},
	})
}

func Error(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, Response{Error: &APIError{Code: code, Message: message}})
}

func BadRequest(w http.ResponseWriter, code, message string) {
	Error(w, http.StatusBadRequest, code, message)
}

func Unauthorized(w http.ResponseWriter) {
	Error(w, http.StatusUnauthorized, ErrCodeUnauthorized, "Authentication required")
}

func Forbidden(w http.ResponseWriter, message string) {
	Error(w, http.StatusForbidden, ErrCodeForbidden, message)
}

func NotFound(w http.ResponseWriter, message string) {
	Error(w, http.StatusNotFound, ErrCodeNotFound, message)
}

func InternalError(w http.ResponseWriter) {
	Error(w, http.StatusInternalServerError, ErrCodeInternal, "Internal server error")
}
