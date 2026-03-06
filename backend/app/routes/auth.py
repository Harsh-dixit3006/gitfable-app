from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.database import User
from app.models.requests import CreateUserRequest, UpdateUserRequest
from app.services.auth import auth_user, get_user_by_firebase_uid
from app.firebase_admin import get_firebase_user

router = APIRouter(prefix="/api")


async def get_db():
    """Dependency to get database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


@router.post("/auth/register")
async def register_user(req: CreateUserRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user in our database after Firebase Auth."""
    # Check if user already exists
    existing = await db.execute(
        select(User).where(
            (User.firebase_uid == req.firebase_uid)
            | (User.username == req.username.lower())
        )
    )
    existing_user = existing.scalar_one_or_none()

    if existing_user:
        if existing_user.firebase_uid == req.firebase_uid:
            raise HTTPException(status_code=409, detail="User already registered")
        else:
            raise HTTPException(status_code=409, detail="Username already taken")

    # Validate username format
    username = req.username.lower().strip()
    if not username or len(username) < 2 or len(username) > 39:
        raise HTTPException(status_code=400, detail="Username must be 2-39 characters")

    import re

    if not re.match(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", username):
        raise HTTPException(
            status_code=400,
            detail="Username can only contain lowercase letters, numbers, and hyphens",
        )

    # Get Firebase user to extract GitHub provider data
    github_id = None
    github_username = None
    try:
        firebase_user = await get_firebase_user(req.firebase_uid)
        # Look for GitHub provider data
        for provider in firebase_user.get("provider_data", []):
            if provider.get("provider_id") == "github.com":
                github_id = provider.get("uid")
                # Extract GitHub username from display_name or email
                github_username = provider.get("display_name")
                break
    except Exception:
        # If Firebase user fetch fails, continue without GitHub data
        pass

    # Create user
    user = User(
        firebase_uid=req.firebase_uid,
        username=username,
        display_name=req.display_name or username,
        email=req.email,
        avatar_url=req.photo_url
        or f"https://api.dicebear.com/7.x/identicon/svg?seed={username}",
        github_id=github_id,
        github_username=github_username or username,
        xp=0,
        level=1,
        current_streak=0,
        longest_streak=0,
        total_contributions=0,
        badges=[],
        filters={"languages": [], "difficulties": []},
        disabled=False,
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return {"message": "User registered successfully", "user": user.to_dict()}


@router.get("/auth/me")
async def get_me(user: dict = Depends(auth_user)):
    """Get current authenticated user's profile."""
    return user


@router.put("/auth/me")
async def update_profile(
    req: UpdateUserRequest,
    user: dict = Depends(auth_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's profile."""
    updates = {}

    if req.display_name is not None:
        updates["display_name"] = req.display_name.strip()

    if req.avatar_url is not None:
        updates["avatar_url"] = req.avatar_url.strip()

    if req.filters is not None:
        updates["filters"] = req.filters.model_dump()

    if updates:
        updates["updated_at"] = datetime.now(timezone.utc)

        await db.execute(
            update(User).where(User.id == UUID(user["id"])).values(**updates)
        )
        await db.commit()

        # Return updated user
        result = await db.execute(select(User).where(User.id == UUID(user["id"])))
        updated_user = result.scalar_one()
        return {"message": "Profile updated", "user": updated_user.to_dict()}

    return {"message": "No changes made"}


@router.post("/auth/sync")
async def sync_firebase_user(firebase_uid: str, db: AsyncSession = Depends(get_db)):
    """Sync Firebase user data with our database."""
    # Get user from Firebase
    try:
        firebase_user = await get_firebase_user(firebase_uid)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Find user in our database
    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=404, detail="User not found in database. Please register first."
        )

    # Update user data from Firebase
    updates = {
        "email": firebase_user.get("email"),
        "updated_at": datetime.now(timezone.utc),
    }

    if (
        firebase_user.get("display_name")
        and firebase_user["display_name"] != user.display_name
    ):
        updates["display_name"] = firebase_user["display_name"]

    if firebase_user.get("photo_url") and firebase_user["photo_url"] != user.avatar_url:
        updates["avatar_url"] = firebase_user["photo_url"]

    await db.execute(
        update(User).where(User.firebase_uid == firebase_uid).values(**updates)
    )
    await db.commit()

    # Return updated user
    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    updated_user = result.scalar_one()

    return {"message": "User synced with Firebase", "user": updated_user.to_dict()}
