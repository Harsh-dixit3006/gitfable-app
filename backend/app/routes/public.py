from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models.database import Issue, User, Activity, Draw

router = APIRouter(prefix="/api")


async def get_db():
    """Dependency to get database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


@router.get("/issues")
async def get_issues(
    language: Optional[str] = None,
    difficulty: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Get issues with optional filters."""
    query = select(Issue).order_by(Issue.stars.desc())

    if language:
        query = query.where(Issue.language.ilike(language))

    if difficulty:
        query = query.where(Issue.difficulty.ilike(difficulty))

    query = query.limit(200)

    result = await db.execute(query)
    issues = result.scalars().all()

    return [issue.to_dict() for issue in issues]


@router.get("/leaderboard")
async def get_leaderboard(
    period: str = "all-time",
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get leaderboard."""
    # For now, just sort by XP (all-time)
    # TODO: Add weekly/monthly leaderboard logic

    result = await db.execute(
        select(User).where(User.disabled == False).order_by(User.xp.desc()).limit(limit)
    )
    users = result.scalars().all()

    leaderboard = []
    for i, user in enumerate(users, 1):
        leaderboard.append(
            {
                "rank": i,
                "id": str(user.id),
                "username": user.username,
                "display_name": user.display_name,
                "avatar_url": user.avatar_url,
                "xp": user.xp,
                "level": user.level,
                "total_contributions": user.total_contributions,
            }
        )

    return {"users": leaderboard, "period": period}


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Get platform statistics."""
    # Count merged draws (issues resolved)
    result = await db.execute(
        select(func.count(Draw.id)).where(Draw.status == "merged")
    )
    issues_resolved = result.scalar() or 0

    # Count active users
    result = await db.execute(select(func.count(User.id)).where(User.disabled == False))
    active_authors = result.scalar() or 0

    # Count unique repositories
    result = await db.execute(select(func.count(func.distinct(Issue.repo))))
    repositories_reached = result.scalar() or 0

    return {
        "issues_resolved": issues_resolved,
        "active_authors": active_authors,
        "repositories_reached": repositories_reached,
    }


@router.get("/activity")
async def get_activity(
    limit: int = Query(10, ge=1, le=50), db: AsyncSession = Depends(get_db)
):
    """Get recent activity feed."""
    result = await db.execute(
        select(Activity).order_by(Activity.timestamp.desc()).limit(limit)
    )
    activities = result.scalars().all()

    return [activity.to_dict() for activity in activities]
