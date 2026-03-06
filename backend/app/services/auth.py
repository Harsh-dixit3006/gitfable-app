from fastapi import HTTPException, Header, Request
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.firebase_admin import verify_firebase_token
from app.database import AsyncSessionLocal
from app.models.database import User


async def get_db_session():
    """Get database session for dependency injection."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def auth_user(authorization: str = Header(None)) -> dict:
    """Authenticate user using Firebase ID token.

    Args:
        authorization: Authorization header with Bearer token

    Returns:
        User dictionary

    Raises:
        HTTPException: 401 if authentication fails, 404 if user not found
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    # Extract token from "Bearer <token>" format
    try:
        scheme, token = authorization.split(" ", 1)
        if scheme.lower() != "bearer":
            raise ValueError("Invalid authorization scheme")
    except ValueError:
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header format. Use: Bearer <token>",
        )

    # Verify Firebase token
    try:
        decoded_token = await verify_firebase_token(token)
        firebase_uid = decoded_token["uid"]
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    # Create session
    async with AsyncSessionLocal() as db:
        # Find user in database by Firebase UID
        result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
        user = result.scalar_one_or_none()

        if not user:
            # User authenticated with Firebase but not in our database yet
            raise HTTPException(
                status_code=403,
                detail="User not registered. Please complete registration.",
            )

        # Check if user is disabled
        if user.disabled:
            raise HTTPException(status_code=403, detail="Account has been disabled")

        return user.to_dict()


async def get_optional_user(request: Request) -> Optional[dict]:
    """Get user if authenticated, otherwise return None.

    Useful for endpoints that work with or without authentication.
    """
    authorization = request.headers.get("Authorization")
    if not authorization:
        return None

    try:
        return await auth_user(authorization)
    except HTTPException:
        return None


async def get_user_by_firebase_uid(
    firebase_uid: str, db: AsyncSession
) -> Optional[User]:
    """Get user by Firebase UID.

    Args:
        firebase_uid: Firebase user UID
        db: Database session

    Returns:
        User model or None
    """
    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    return result.scalar_one_or_none()


async def get_user_by_username(username: str, db: AsyncSession) -> Optional[User]:
    """Get user by username.

    Args:
        username: Username (case-insensitive)
        db: Database session

    Returns:
        User model or None
    """
    result = await db.execute(select(User).where(User.username.ilike(username)))
    return result.scalar_one_or_none()


async def get_user_by_id(user_id: str, db: AsyncSession) -> Optional[User]:
    """Get user by ID.

    Args:
        user_id: User UUID
        db: Database session

    Returns:
        User model or None
    """
    from uuid import UUID

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    return result.scalar_one_or_none()
