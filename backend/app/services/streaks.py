from datetime import datetime, timezone, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import User


async def update_streak(user_id: str, db: AsyncSession) -> None:
    """Update user's contribution streak.

    Args:
        user_id: User UUID string
        db: Database session
    """
    from uuid import UUID

    # Get current user data
    result = await db.execute(
        select(
            User.current_streak, User.longest_streak, User.last_contribution_date
        ).where(User.id == UUID(user_id))
    )
    user_data = result.fetchone()

    if not user_data:
        return

    current_streak = user_data[0] or 0
    longest_streak = user_data[1] or 0
    last_contribution = user_data[2]

    now = datetime.now(timezone.utc)

    if last_contribution:
        # Calculate hours since last contribution
        hours_diff = (now - last_contribution).total_seconds() / 3600

        if hours_diff < 24:
            # Less than 24 hours - same day, no change
            pass
        elif hours_diff < 48:
            # 24-48 hours - next day, increment streak
            current_streak += 1
        else:
            # More than 48 hours - streak broken, reset to 1
            current_streak = 1
    else:
        # First contribution
        current_streak = 1

    # Update longest streak
    longest_streak = max(longest_streak, current_streak)

    # Update user
    await db.execute(
        update(User)
        .where(User.id == UUID(user_id))
        .values(
            current_streak=current_streak,
            longest_streak=longest_streak,
            last_contribution_date=now,
        )
    )

    await db.commit()


async def get_streak_info(user_id: str, db: AsyncSession) -> dict:
    """Get user's streak information.

    Args:
        user_id: User UUID string
        db: Database session

    Returns:
        Dict with current_streak, longest_streak, last_contribution_date
    """
    from uuid import UUID

    result = await db.execute(
        select(
            User.current_streak, User.longest_streak, User.last_contribution_date
        ).where(User.id == UUID(user_id))
    )
    user_data = result.fetchone()

    if not user_data:
        return {
            "current_streak": 0,
            "longest_streak": 0,
            "last_contribution_date": None,
        }

    return {
        "current_streak": user_data[0] or 0,
        "longest_streak": user_data[1] or 0,
        "last_contribution_date": user_data[2].isoformat() if user_data[2] else None,
    }


async def reset_streak_if_needed(user_id: str, db: AsyncSession) -> bool:
    """Reset streak if more than 48 hours since last contribution.

    Args:
        user_id: User UUID string
        db: Database session

    Returns:
        True if streak was reset, False otherwise
    """
    from uuid import UUID

    result = await db.execute(
        select(User.last_contribution_date, User.current_streak).where(
            User.id == UUID(user_id)
        )
    )
    user_data = result.fetchone()

    if not user_data or not user_data[0]:
        return False

    last_contribution = user_data[0]
    now = datetime.now(timezone.utc)
    hours_diff = (now - last_contribution).total_seconds() / 3600

    if hours_diff >= 48:
        # Reset streak
        await db.execute(
            update(User).where(User.id == UUID(user_id)).values(current_streak=0)
        )
        await db.commit()
        return True

    return False
