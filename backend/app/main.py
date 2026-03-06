import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS, IS_PRODUCTION
from app.database import init_db, close_db, check_connection
from app.redis_client import get_redis_client, close_redis
from app.firebase_admin import get_firebase_app
from app.database_indexes import create_indexes
from app.services.badges import initialize_badges
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware

# Import routes
from app.routes import auth, draws, users, public, webhooks

# Maximum request body size: 1MB
MAX_REQUEST_SIZE = 1 * 1024 * 1024

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager."""
    # Startup
    logger.info("Starting up GitFable API...")

    # Initialize Firebase Admin SDK
    try:
        get_firebase_app()
        logger.info("Firebase Admin SDK initialized")
    except ValueError as e:
        logger.error(f"Firebase initialization failed: {e}")
        raise

    # Initialize PostgreSQL database
    try:
        await init_db()
        logger.info("PostgreSQL database initialized")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise

    # Create indexes
    try:
        await create_indexes()
        logger.info("Database indexes verified")
    except Exception as e:
        logger.error(f"Index creation failed: {e}")

    # Initialize badges and seed data
    try:
        from app.database import AsyncSessionLocal
        from app.seed import seed_database

        async with AsyncSessionLocal() as db:
            await initialize_badges(db)
            if not IS_PRODUCTION:
                await seed_database(db)
        logger.info("Badges initialized and data seeded")
    except Exception as e:
        logger.error(f"Badge initialization failed: {e}")

    logger.info("GitFable API startup complete!")

    yield

    # Shutdown
    logger.info("Shutting down GitFable API...")

    try:
        await close_db()
        logger.info("PostgreSQL connection closed")
    except Exception as e:
        logger.error(f"Error closing database: {e}")

    try:
        await close_redis()
        logger.info("Redis connection closed")
    except Exception as e:
        logger.error(f"Error closing Redis: {e}")


app = FastAPI(
    title="GitFable API",
    description="Gamified open-source contribution matching platform",
    version="1.0.0",
    lifespan=lifespan,
)


# Security: Request size limit
@app.middleware("http")
async def limit_request_size(request, call_next):
    """Limit request body size to prevent DoS."""
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_REQUEST_SIZE:
                from fastapi.responses import JSONResponse

                return JSONResponse(
                    status_code=413,
                    content={
                        "error": "Request entity too large",
                        "max_size": MAX_REQUEST_SIZE,
                    },
                )
        except ValueError:
            pass
    return await call_next(request)


# Security: Add security headers
app.add_middleware(SecurityHeadersMiddleware)

# Security: Add rate limiting
redis_client = get_redis_client()
app.add_middleware(RateLimitMiddleware, redis_client=redis_client)

# CORS middleware - credentials only allowed with explicit origins
if CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=CORS_ORIGINS,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-RateLimit-Remaining", "X-RateLimit-Reset"],
    )
else:
    # In production, if no origins specified, don't add CORS
    # This prevents credentials from being sent to unknown origins
    logger.warning(
        "No CORS origins configured. API will reject cross-origin requests with credentials."
    )

# Register route modules
app.include_router(auth.router)
app.include_router(draws.router)
app.include_router(users.router)
app.include_router(public.router)
app.include_router(webhooks.router)


@app.get("/health")
async def health_check():
    """Basic health check endpoint."""
    return {"status": "healthy", "version": "1.0.0"}


@app.get("/ready")
async def readiness_check():
    """Readiness check - verifies database connection."""
    try:
        # Check PostgreSQL connection
        is_connected = await check_connection()
        if is_connected:
            return {"status": "ready", "database": "connected"}
        else:
            return {"status": "not_ready", "database": "disconnected"}, 503
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return {"status": "not_ready", "database": "error", "error": str(e)}, 503
