from datetime import datetime, timezone
from typing import List

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.database import Badge, UserBadge, Draw, User, Issue


# Badge definitions (should match database)
BADGES_META = [
    {"name": "Prologue", "description": "First merged PR", "icon": "book-open"},
    {"name": "Short Story", "description": "3 PRs merged", "icon": "files"},
    {"name": "The Epic", "description": "100 PRs merged", "icon": "library"},
    {"name": "Anthology", "description": "PRs in 5+ languages", "icon": "book-copy"},
    {
        "name": "Midnight Draft",
        "description": "PR merged midnight-5am",
        "icon": "moon-star",
    },
    {
        "name": "Fast Forward",
        "description": "PR merged within 24h",
        "icon": "fast-forward",
    },
    {"name": "Daily Author", "description": "30-day streak", "icon": "pen-tool"},
    {"name": "Worldbuilder", "description": "10+ different repos", "icon": "globe"},
    {"name": "Proofreader", "description": "10 bug PRs merged", "icon": "search"},
    {"name": "The Archivist", "description": "10 docs PRs merged", "icon": "bookmark"},
]


async def check_badges(user_id: str, db: AsyncSession) -> List[dict]:
    """Check and award badges to user.

    Args:
        user_id: User UUID string
        db: Database session

    Returns:
        List of newly awarded badges
    """
    from uuid import UUID

    # Get user
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()

    if not user:
        return []

    # Get already earned badges
    result = await db.execute(
        select(Badge.name).join(UserBadge).where(UserBadge.user_id == UUID(user_id))
    )
    earned = {row[0] for row in result.fetchall()}

    # Get merged draws with issue data
    result = await db.execute(
        select(Draw)
        .options(selectinload(Draw.issue))
        .where(Draw.user_id == UUID(user_id))
        .where(Draw.status == "merged")
    )
    merged_draws = result.scalars().all()

    count = len(merged_draws)
    new_badges = []
    now = datetime.now(timezone.utc)

    # Check each badge condition

    # Prologue: First merged PR
    if "Prologue" not in earned and count >= 1:
        new_badges.append(await _award_badge(user_id, "Prologue", db, now))

    # Short Story: 3 PRs merged
    if "Short Story" not in earned and count >= 3:
        new_badges.append(await _award_badge(user_id, "Short Story", db, now))

    # The Epic: 100 PRs merged
    if "The Epic" not in earned and count >= 100:
        new_badges.append(await _award_badge(user_id, "The Epic", db, now))

    # Anthology: PRs in 5+ languages
    if "Anthology" not in earned and count > 0:
        languages = {
            draw.issue.language
            for draw in merged_draws
            if draw.issue and draw.issue.language
        }
        if len(languages) >= 5:
            new_badges.append(await _award_badge(user_id, "Anthology", db, now))

    # Midnight Draft: PR merged midnight-5am
    if "Midnight Draft" not in earned and count > 0:
        for draw in merged_draws:
            if draw.merged_at and draw.merged_at.hour < 5:
                new_badges.append(
                    await _award_badge(user_id, "Midnight Draft", db, now)
                )
                break

    # Fast Forward: PR merged within 24h
    if "Fast Forward" not in earned and count > 0:
        for draw in merged_draws:
            if draw.merged_at and draw.drawn_at:
                diff = (draw.merged_at - draw.drawn_at).total_seconds()
                if diff < 86400:  # 24 hours
                    new_badges.append(
                        await _award_badge(user_id, "Fast Forward", db, now)
                    )
                    break

    # Daily Author: 30-day streak
    if "Daily Author" not in earned and user.longest_streak >= 30:
        new_badges.append(await _award_badge(user_id, "Daily Author", db, now))

    # Worldbuilder: 10+ different repos
    if "Worldbuilder" not in earned and count > 0:
        repos = {draw.issue.repo for draw in merged_draws if draw.issue}
        if len(repos) >= 10:
            new_badges.append(await _award_badge(user_id, "Worldbuilder", db, now))

    # Proofreader: 10 bug PRs merged
    if "Proofreader" not in earned and count > 0:
        bug_count = 0
        for draw in merged_draws:
            if draw.issue and draw.issue.labels:
                if any("bug" in label.lower() for label in draw.issue.labels):
                    bug_count += 1
        if bug_count >= 10:
            new_badges.append(await _award_badge(user_id, "Proofreader", db, now))

    # The Archivist: 10 docs PRs merged
    if "The Archivist" not in earned and count > 0:
        doc_count = 0
        for draw in merged_draws:
            if draw.issue and draw.issue.labels:
                if any("doc" in label.lower() for label in draw.issue.labels):
                    doc_count += 1
        if doc_count >= 10:
            new_badges.append(await _award_badge(user_id, "The Archivist", db, now))

    # Filter out None values (if badge already existed)
    return [b for b in new_badges if b]


async def _award_badge(
    user_id: str, badge_name: str, db: AsyncSession, earned_at: datetime
) -> dict:
    """Award a badge to user.

    Args:
        user_id: User UUID string
        badge_name: Badge name
        db: Database session
        earned_at: Timestamp

    Returns:
        Badge info dict or None if already has badge
    """
    from uuid import UUID

    # Get badge ID
    result = await db.execute(select(Badge).where(Badge.name == badge_name))
    badge = result.scalar_one_or_none()

    if not badge:
        # Badge doesn't exist in database, skip
        return None

    # Check if user already has this badge
    result = await db.execute(
        select(UserBadge)
        .where(UserBadge.user_id == UUID(user_id))
        .where(UserBadge.badge_id == badge.id)
    )
    if result.scalar_one_or_none():
        return None

    # Award badge
    user_badge = UserBadge(
        user_id=UUID(user_id), badge_id=badge.id, earned_at=earned_at
    )
    db.add(user_badge)
    await db.commit()

    return {"name": badge.name, "earned_at": earned_at.isoformat()}


async def get_user_badges(user_id: str, db: AsyncSession) -> List[dict]:
    """Get all badges earned by user.

    Args:
        user_id: User UUID string
        db: Database session

    Returns:
        List of badge dicts with earned_at
    """
    from uuid import UUID

    result = await db.execute(
        select(Badge, UserBadge.earned_at)
        .join(UserBadge)
        .where(UserBadge.user_id == UUID(user_id))
        .order_by(UserBadge.earned_at.desc())
    )

    badges = []
    for badge, earned_at in result.fetchall():
        badges.append(
            {
                "name": badge.name,
                "description": badge.description,
                "icon": badge.icon,
                "earned_at": earned_at.isoformat() if earned_at else None,
            }
        )

    return badges


async def initialize_badges(db: AsyncSession) -> None:
    """Initialize badge definitions in database.

    Should be called on startup to ensure badges exist.
    """
    for badge_meta in BADGES_META:
        # Check if badge exists
        result = await db.execute(select(Badge).where(Badge.name == badge_meta["name"]))
        if not result.scalar_one_or_none():
            # Create badge
            badge = Badge(
                name=badge_meta["name"],
                description=badge_meta["description"],
                icon=badge_meta["icon"],
            )
            db.add(badge)

    await db.commit()
