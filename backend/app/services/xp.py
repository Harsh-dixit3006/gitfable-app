from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import User


def calc_level(xp: int) -> int:
    """Calculate user level from XP. Pure function, no DB dependency.

    Level 1: 0-499 XP
    Level 2: 500-999 XP
    Level 3: 1000-1499 XP
    etc.
    """
    return (xp // 500) + 1


async def award_xp(user_id: str, amount: int, db: AsyncSession) -> tuple[int, int]:
    """Award XP to user and update level.

    Args:
        user_id: User UUID string
        amount: XP amount to award
        db: Database session

    Returns:
        Tuple of (new_xp, new_level)
    """
    from uuid import UUID

    # Get current user XP
    result = await db.execute(
        select(User.xp, User.level).where(User.id == UUID(user_id))
    )
    user_data = result.fetchone()

    if not user_data:
        return 0, 1

    current_xp = user_data[0] or 0
    new_xp = current_xp + amount
    new_level = calc_level(new_xp)

    # Update user in single query
    await db.execute(
        update(User).where(User.id == UUID(user_id)).values(xp=new_xp, level=new_level)
    )

    await db.commit()

    return new_xp, new_level


async def get_user_xp(user_id: str, db: AsyncSession) -> tuple[int, int]:
    """Get user's current XP and level.

    Args:
        user_id: User UUID string
        db: Database session

    Returns:
        Tuple of (xp, level)
    """
    from uuid import UUID

    result = await db.execute(
        select(User.xp, User.level).where(User.id == UUID(user_id))
    )
    user_data = result.fetchone()

    if not user_data:
        return 0, 1

    return user_data[0] or 0, user_data[1] or 1


async def update_user_level(user_id: str, db: AsyncSession) -> int:
    """Recalculate and update user level based on current XP.

    Args:
        user_id: User UUID string
        db: Database session

    Returns:
        New level
    """
    from uuid import UUID

    # Get current XP
    result = await db.execute(select(User.xp).where(User.id == UUID(user_id)))
    xp_data = result.scalar_one_or_none()

    if xp_data is None:
        return 1

    new_level = calc_level(xp_data)

    # Update level
    await db.execute(
        update(User).where(User.id == UUID(user_id)).values(level=new_level)
    )

    await db.commit()

    return new_level
