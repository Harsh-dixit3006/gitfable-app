from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models.database import User, Draw, Issue, Activity, Badge
from app.models.requests import FilterUpdate
from app.services.auth import auth_user
from app.services.badges import BADGES_META, get_user_badges

router = APIRouter(prefix="/api")


async def get_db():
    """Dependency to get database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


@router.get("/dashboard")
async def get_dashboard(
    user: dict = Depends(auth_user), db: AsyncSession = Depends(get_db)
):
    """Get user dashboard data."""
    # Get user with all data
    result = await db.execute(select(User).where(User.id == UUID(user["id"])))
    user_obj = result.scalar_one()

    # Get recent draws (last 5)
    result = await db.execute(
        select(Draw)
        .options(selectinload(Draw.issue))
        .where(Draw.user_id == UUID(user["id"]))
        .order_by(Draw.drawn_at.desc())
        .limit(5)
    )
    recent_draws = result.scalars().all()

    # Get merged draws for heatmap (last 365 days)
    one_year_ago = datetime.now(timezone.utc) - timedelta(days=365)
    result = await db.execute(
        select(func.date(Draw.merged_at), func.count(Draw.id))
        .where(Draw.user_id == UUID(user["id"]))
        .where(Draw.status == "merged")
        .where(Draw.merged_at >= one_year_ago)
        .group_by(func.date(Draw.merged_at))
    )
    heatmap_data = {str(date): count for date, count in result.fetchall()}

    # Get user's badges
    badges = await get_user_badges(user["id"], db)

    return {
        "user": user_obj.to_dict(),
        "recent_draws": [
            {**draw.to_dict(), "issue": draw.issue.to_dict() if draw.issue else None}
            for draw in recent_draws
        ],
        "heatmap": heatmap_data,
        "badges": badges,
        "badges_meta": BADGES_META,
    }


@router.get("/profile/{username}")
async def get_profile(username: str, db: AsyncSession = Depends(get_db)):
    """Get public profile for a user."""
    # Find user by username
    result = await db.execute(select(User).where(User.username.ilike(username)))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get recent merged draws (last 10)
    result = await db.execute(
        select(Draw)
        .options(selectinload(Draw.issue))
        .where(Draw.user_id == user.id)
        .where(Draw.status == "merged")
        .order_by(Draw.merged_at.desc())
        .limit(10)
    )
    recent_merges = result.scalars().all()

    # Get user's badges
    badges = await get_user_badges(str(user.id), db)

    # Safe user data (exclude sensitive fields)
    safe_user = {
        "id": str(user.id),
        "username": user.username,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "xp": user.xp,
        "level": user.level,
        "current_streak": user.current_streak,
        "longest_streak": user.longest_streak,
        "total_contributions": user.total_contributions,
        "joined_at": user.joined_at.isoformat() if user.joined_at else None,
        "badges": badges,
    }

    return {
        "user": safe_user,
        "recent_merges": [
            {**draw.to_dict(), "issue": draw.issue.to_dict() if draw.issue else None}
            for draw in recent_merges
        ],
    }


@router.put("/users/filters")
async def update_filters(
    filters: FilterUpdate,
    user: dict = Depends(auth_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user's filter preferences."""
    from sqlalchemy import update as sql_update

    await db.execute(
        sql_update(User)
        .where(User.id == UUID(user["id"]))
        .values(filters=filters.model_dump(), updated_at=datetime.now(timezone.utc))
    )
    await db.commit()

    return {"message": "Filters updated", "filters": filters.model_dump()}
