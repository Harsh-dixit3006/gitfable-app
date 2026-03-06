import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, insert, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Draw, Issue, User


def build_draw_record(user_id: str, issue: Issue, source: str) -> Draw:
    """Build a new draw record.

    Args:
        user_id: User UUID string
        issue: Issue model
        source: 'draw' or 'choose'

    Returns:
        Draw model instance
    """
    from uuid import UUID

    return Draw(
        id=uuid.uuid4(),
        user_id=UUID(user_id),
        issue_id=issue.id,
        status="drawn",
        source=source,
        drawn_at=datetime.now(timezone.utc),
    )


async def get_draws_remaining(user_id: str, db: AsyncSession) -> int:
    """Get remaining draws for user today.

    Args:
        user_id: User UUID string
        db: Database session

    Returns:
        Number of draws remaining (0-3)
    """
    from uuid import UUID

    # Get user's last draw date and count
    result = await db.execute(
        select(User.last_redraw_date, User.redraws_today).where(
            User.id == UUID(user_id)
        )
    )
    user_data = result.fetchone()

    if not user_data:
        return 3

    last_date = user_data[0]
    draws_today = user_data[1] or 0

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # If last draw was not today, reset count
    if not last_date or last_date.strftime("%Y-%m-%d") != today:
        return 3

    return max(0, 3 - draws_today)


async def increment_draw_count(user_id: str, db: AsyncSession) -> None:
    """Increment user's draw count for today.

    Args:
        user_id: User UUID string
        db: Database session
    """
    from uuid import UUID

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Check if we need to reset or increment
    result = await db.execute(
        select(User.last_redraw_date, User.redraws_today).where(
            User.id == UUID(user_id)
        )
    )
    user_data = result.fetchone()

    if user_data and user_data[0] and user_data[0].strftime("%Y-%m-%d") == today:
        # Same day, increment
        await db.execute(
            update(User)
            .where(User.id == UUID(user_id))
            .values(redraws_today=(User.redraws_today + 1))
        )
    else:
        # New day, reset to 1
        await db.execute(
            update(User)
            .where(User.id == UUID(user_id))
            .values(redraws_today=1, last_redraw_date=datetime.now(timezone.utc))
        )

    await db.commit()


async def get_random_issue(
    db: AsyncSession,
    languages: Optional[list] = None,
    difficulties: Optional[list] = None,
) -> Optional[Issue]:
    """Get a random issue matching filters.

    Args:
        db: Database session
        languages: List of language filters
        difficulties: List of difficulty filters

    Returns:
        Random Issue or None
    """
    from sqlalchemy import and_

    query = select(Issue)

    # Build filter conditions
    conditions = []
    if languages:
        conditions.append(Issue.language.in_(languages))
    if difficulties:
        conditions.append(Issue.difficulty.in_(difficulties))

    if conditions:
        query = query.where(and_(*conditions))

    # Order by random and limit to 1
    query = query.order_by(func.random()).limit(1)

    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_user_draws(
    user_id: str, db: AsyncSession, status: Optional[str] = None, limit: int = 50
) -> list[Draw]:
    """Get user's draws.

    Args:
        user_id: User UUID string
        db: Database session
        status: Filter by status
        limit: Max results

    Returns:
        List of Draw models
    """
    from uuid import UUID

    query = select(Draw).where(Draw.user_id == UUID(user_id))

    if status:
        query = query.where(Draw.status == status)

    query = query.order_by(Draw.drawn_at.desc()).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


async def get_draw_by_id(
    draw_id: str, user_id: str, db: AsyncSession
) -> Optional[Draw]:
    """Get a specific draw by ID and verify ownership.

    Args:
        draw_id: Draw UUID string
        user_id: User UUID string
        db: Database session

    Returns:
        Draw model or None
    """
    from uuid import UUID

    result = await db.execute(
        select(Draw)
        .where(Draw.id == UUID(draw_id))
        .where(Draw.user_id == UUID(user_id))
    )
    return result.scalar_one_or_none()


async def get_user_draw_stats(user_id: str, db: AsyncSession) -> dict:
    """Get draw statistics for user.

    Args:
        user_id: User UUID string
        db: Database session

    Returns:
        Dict with total_draws, bookmark_rate, merge_rate
    """
    from uuid import UUID
    from sqlalchemy import case

    # Get total draws
    result = await db.execute(
        select(func.count(Draw.id)).where(Draw.user_id == UUID(user_id))
    )
    total = result.scalar() or 0

    if total == 0:
        return {"total_draws": 0, "bookmark_rate": 0, "merge_rate": 0}

    # Get bookmarked count (bookmarked, pr_submitted, merged)
    result = await db.execute(
        select(func.count(Draw.id))
        .where(Draw.user_id == UUID(user_id))
        .where(Draw.status.in_(["bookmarked", "pr_submitted", "merged"]))
    )
    bookmarked = result.scalar() or 0

    # Get merged count
    result = await db.execute(
        select(func.count(Draw.id))
        .where(Draw.user_id == UUID(user_id))
        .where(Draw.status == "merged")
    )
    merged = result.scalar() or 0

    return {
        "total_draws": total,
        "bookmark_rate": round(bookmarked / total * 100),
        "merge_rate": round(merged / total * 100),
    }
