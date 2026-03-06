import time
import hashlib
from typing import Optional
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import REDIS_URL, RATE_LIMIT_ENABLED


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware using Redis or in-memory storage."""

    def __init__(self, app, redis_client=None):
        super().__init__(app)
        self.redis = redis_client
        self.local_storage = {}  # Fallback for development

    async def dispatch(self, request: Request, call_next):
        if not RATE_LIMIT_ENABLED:
            return await call_next(request)

        # Get client identifier
        client_id = self._get_client_id(request)

        # Check rate limit
        is_allowed, retry_after = await self._check_rate_limit(client_id, request)

        if not is_allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Rate limit exceeded",
                    "message": "Too many requests. Please try again later.",
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

        response = await call_next(request)

        # Add rate limit headers
        remaining, reset_time = await self._get_rate_limit_info(client_id, request)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(reset_time))

        return response

    def _get_client_id(self, request: Request) -> str:
        """Generate a unique identifier for the client."""
        # Use X-Forwarded-For if behind proxy, otherwise use client host
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            ip = forwarded_for.split(",")[0].strip()
        else:
            ip = request.client.host if request.client else "unknown"

        # Include user ID if authenticated
        user_id = getattr(request.state, "user_id", None)
        if user_id:
            return f"user:{user_id}"

        return f"ip:{ip}"

    def _get_endpoint_key(self, request: Request) -> str:
        """Get rate limit key based on endpoint."""
        path = request.url.path
        method = request.method

        # Stricter limits for auth endpoints
        if "/auth/" in path:
            return f"auth:{method}:{path}"

        # Standard limits for API
        if "/api/" in path:
            return f"api:{method}:{path}"

        return f"default:{method}:{path}"

    async def _check_rate_limit(
        self, client_id: str, request: Request
    ) -> tuple[bool, int]:
        """Check if request is within rate limit. Returns (is_allowed, retry_after)."""
        endpoint_key = self._get_endpoint_key(request)
        key = f"ratelimit:{client_id}:{endpoint_key}"

        # Define limits per endpoint type
        if "auth" in endpoint_key:
            limit = 10  # 10 requests
            window = 60  # per minute
        elif "draw" in endpoint_key and request.method == "POST":
            limit = 5  # 5 draw requests
            window = 60  # per minute
        else:
            limit = 100  # 100 requests
            window = 60  # per minute

        now = time.time()

        if self.redis:
            # Use Redis for distributed rate limiting
            try:
                pipe = self.redis.pipeline()
                pipe.zremrangebyscore(key, 0, now - window)
                pipe.zcard(key)
                pipe.zadd(key, {str(now): now})
                pipe.expire(key, window)
                _, current_count, _, _ = await pipe.execute()

                if current_count >= limit:
                    retry_after = int(window - (now % window))
                    return False, retry_after

            except Exception:
                # Fallback to local storage if Redis fails
                pass

        # Local storage fallback
        if key not in self.local_storage:
            self.local_storage[key] = []

        # Clean old entries
        self.local_storage[key] = [
            ts for ts in self.local_storage[key] if ts > now - window
        ]

        if len(self.local_storage[key]) >= limit:
            retry_after = int(window - (now % window))
            return False, retry_after

        self.local_storage[key].append(now)
        return True, 0

    async def _get_rate_limit_info(
        self, client_id: str, request: Request
    ) -> tuple[int, float]:
        """Get remaining requests and reset time."""
        endpoint_key = self._get_endpoint_key(request)
        key = f"ratelimit:{client_id}:{endpoint_key}"

        if "auth" in endpoint_key:
            limit = 10
            window = 60
        elif "draw" in endpoint_key:
            limit = 5
            window = 60
        else:
            limit = 100
            window = 60

        now = time.time()

        if self.redis and key in self.local_storage:
            # Clean local storage to get accurate count
            self.local_storage[key] = [
                ts for ts in self.local_storage[key] if ts > now - window
            ]

        current_count = len(self.local_storage.get(key, []))
        remaining = max(0, limit - current_count)
        reset_time = now + window

        return remaining, reset_time
