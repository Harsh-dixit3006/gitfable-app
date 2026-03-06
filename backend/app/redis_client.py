import redis.asyncio as redis
from app.config import REDIS_URL, RATE_LIMIT_ENABLED

_redis_client = None


def get_redis_client():
    """Get or create Redis client singleton."""
    global _redis_client

    if not RATE_LIMIT_ENABLED:
        return None

    if _redis_client is None:
        try:
            _redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        except Exception:
            # Redis not available, will fall back to local storage
            _redis_client = None

    return _redis_client


async def close_redis():
    """Close Redis connection on shutdown."""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None
