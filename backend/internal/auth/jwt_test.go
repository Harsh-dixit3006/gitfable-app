package auth

import (
	"testing"
	"time"
)

func newTestManager(t *testing.T) *JWTManager {
	t.Helper()
	m, err := NewJWTManager("this-is-a-secret-key-that-is-long-enough", 15*time.Minute, 7*24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func TestNewJWTManager_ShortSecret(t *testing.T) {
	_, err := NewJWTManager("short", 15*time.Minute, 7*24*time.Hour)
	if err == nil {
		t.Fatal("expected error for short secret")
	}
}

func TestSignAndVerifyAccessToken(t *testing.T) {
	m := newTestManager(t)

	token, err := m.SignAccessToken("12345", "user@example.com")
	if err != nil {
		t.Fatal(err)
	}

	claims, err := m.Verify(token)
	if err != nil {
		t.Fatal(err)
	}

	if claims.Sub != "12345" {
		t.Errorf("sub = %q, want %q", claims.Sub, "12345")
	}
	if claims.Email != "user@example.com" {
		t.Errorf("email = %q, want %q", claims.Email, "user@example.com")
	}
	if claims.TokenType != TokenTypeAccess {
		t.Errorf("token_type = %q, want %q", claims.TokenType, TokenTypeAccess)
	}
}

func TestSignAndVerifyRefreshToken(t *testing.T) {
	m := newTestManager(t)

	token, err := m.SignRefreshToken("12345")
	if err != nil {
		t.Fatal(err)
	}

	claims, err := m.Verify(token)
	if err != nil {
		t.Fatal(err)
	}

	if claims.Sub != "12345" {
		t.Errorf("sub = %q, want %q", claims.Sub, "12345")
	}
	if claims.TokenType != TokenTypeRefresh {
		t.Errorf("token_type = %q, want %q", claims.TokenType, TokenTypeRefresh)
	}
}

func TestSignAndVerifyRegistrationToken(t *testing.T) {
	m := newTestManager(t)

	token, err := m.SignRegistrationToken("67890", "new@example.com")
	if err != nil {
		t.Fatal(err)
	}

	claims, err := m.Verify(token)
	if err != nil {
		t.Fatal(err)
	}

	if claims.Sub != "67890" {
		t.Errorf("sub = %q, want %q", claims.Sub, "67890")
	}
	if claims.TokenType != TokenTypeRegistration {
		t.Errorf("token_type = %q, want %q", claims.TokenType, TokenTypeRegistration)
	}
}

func TestVerify_WrongSecret(t *testing.T) {
	m := newTestManager(t)
	token, err := m.SignAccessToken("12345", "user@example.com")
	if err != nil {
		t.Fatal(err)
	}

	other, _ := NewJWTManager("a-completely-different-secret-key-here!", 15*time.Minute, 7*24*time.Hour)
	_, err = other.Verify(token)
	if err == nil {
		t.Fatal("expected error for wrong secret")
	}
}

func TestVerify_ExpiredToken(t *testing.T) {
	m, _ := NewJWTManager("this-is-a-secret-key-that-is-long-enough", 0, 0)

	token, err := m.SignAccessToken("12345", "user@example.com")
	if err != nil {
		t.Fatal(err)
	}

	// Token has 0 TTL so it expires immediately
	time.Sleep(time.Millisecond)
	_, err = m.Verify(token)
	if err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestVerify_InvalidToken(t *testing.T) {
	m := newTestManager(t)
	_, err := m.Verify("not.a.valid.token")
	if err == nil {
		t.Fatal("expected error for invalid token")
	}
}
