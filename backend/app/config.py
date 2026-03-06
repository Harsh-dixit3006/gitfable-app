import os
import secrets
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")


def _require_env(key: str) -> str:
    """Require an environment variable to be set."""
    value = os.environ.get(key)
    if not value:
        raise ValueError(f"Required environment variable {key} is not set")
    return value


def _parse_cors_origins(origins_str: str) -> list[str]:
    """Parse CORS origins from comma-separated string."""
    if not origins_str:
        return []
    return [origin.strip() for origin in origins_str.split(",") if origin.strip()]


# PostgreSQL Database Configuration
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")
POSTGRES_USER = os.environ.get("POSTGRES_USER", "gitfable")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "gitfable")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "gitfable")

# Build database URL
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    f"postgresql+asyncpg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}",
)

# Firebase Admin SDK Configuration
# Path to Firebase service account JSON file or individual env vars
FIREBASE_SERVICE_ACCOUNT_PATH = os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH", "")
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "")
FIREBASE_PRIVATE_KEY_ID = os.environ.get("FIREBASE_PRIVATE_KEY_ID", "")
FIREBASE_PRIVATE_KEY = os.environ.get("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")
FIREBASE_CLIENT_EMAIL = os.environ.get("FIREBASE_CLIENT_EMAIL", "")
FIREBASE_CLIENT_ID = os.environ.get("FIREBASE_CLIENT_ID", "")
FIREBASE_AUTH_URI = os.environ.get(
    "FIREBASE_AUTH_URI", "https://accounts.google.com/o/oauth2/auth"
)
FIREBASE_TOKEN_URI = os.environ.get(
    "FIREBASE_TOKEN_URI", "https://oauth2.googleapis.com/token"
)
FIREBASE_AUTH_PROVIDER_CERT_URL = os.environ.get(
    "FIREBASE_AUTH_PROVIDER_CERT_URL", "https://www.googleapis.com/oauth2/v1/certs"
)
FIREBASE_CLIENT_CERT_URL = os.environ.get("FIREBASE_CLIENT_CERT_URL", "")

# CORS - reject credentials if no explicit origins set
CORS_ORIGINS_STR = os.environ.get("CORS_ORIGINS", "").strip()
CORS_ORIGINS = _parse_cors_origins(CORS_ORIGINS_STR)

# Environment
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").lower()
IS_PRODUCTION = ENVIRONMENT == "production"

# In production, require explicit CORS origins
if IS_PRODUCTION and not CORS_ORIGINS:
    raise ValueError(
        "CORS_ORIGINS must be explicitly set in production. "
        "Use comma-separated list of allowed origins."
    )

# Rate Limiting
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
RATE_LIMIT_ENABLED = os.environ.get("RATE_LIMIT_ENABLED", "true").lower() == "true"

# GitHub API (for PR verification and issue syncing)
GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")

# Frontend URL (for redirects)
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
