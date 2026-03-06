from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.database import Draw, Issue, User, Activity
from app.models.requests import DrawRequest, ChooseIssueRequest, SubmitPRRequest
from app.services.auth import auth_user, get_db_session
from app.services.xp import award_xp
from app.services.badges import check_badges
from app.services.streaks import update_streak
from app.services.draws import (
    build_draw_record,
    get_draws_remaining,
    increment_draw_count,
    get_random_issue,
    get_user_draws,
    get_draw_by_id,
    get_user_draw_stats,
)
from app.services.github_pr import verify_pr_merge, GitHubAPIError

router = APIRouter(prefix="/api")


async def get_db():
    """Dependency to get database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


@router.post("/draws/draw")
async def draw_issue(
    req: DrawRequest,
    user: dict = Depends(auth_user),
    db: AsyncSession = Depends(get_db),
):
    """Draw a random issue."""
    # Check rate limit (draws per day)
    draws_remaining = await get_draws_remaining(user["id"], db)
    if draws_remaining <= 0:
        raise HTTPException(
            status_code=429, detail="Max 3 draws per day reached. Come back tomorrow!"
        )

    # Get random issue
    issue = await get_random_issue(
        db,
        languages=req.languages if req.languages else None,
        difficulties=req.difficulties if req.difficulties else None,
    )

    if not issue:
        raise HTTPException(
            status_code=404, detail="No issues found matching your filters"
        )

    # Create draw record
    draw = build_draw_record(user["id"], issue, "draw")
    db.add(draw)
    await db.flush()  # Get the ID

    # Increment draw count
    await increment_draw_count(user["id"], db)

    # Award XP
    new_xp, new_level = await award_xp(user["id"], 10, db)

    await db.commit()

    return {
        "id": str(draw.id),
        "user_id": str(draw.user_id),
        "issue_id": str(draw.issue_id),
        "issue": issue.to_dict(),
        "status": draw.status,
        "source": draw.source,
        "drawn_at": draw.drawn_at.isoformat(),
        "redraws_remaining": draws_remaining - 1,
        "xp_awarded": 10,
        "new_xp": new_xp,
        "new_level": new_level,
    }


@router.post("/draws/choose")
async def choose_issue(
    req: ChooseIssueRequest,
    user: dict = Depends(auth_user),
    db: AsyncSession = Depends(get_db),
):
    """Choose a specific issue."""
    from sqlalchemy import select

    # Get issue
    result = await db.execute(select(Issue).where(Issue.id == UUID(req.issue_id)))
    issue = result.scalar_one_or_none()

    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    # Create draw record
    draw = build_draw_record(user["id"], issue, "choose")
    db.add(draw)
    await db.flush()

    # Award XP (less than random draw)
    new_xp, new_level = await award_xp(user["id"], 5, db)

    # Get remaining draws
    draws_remaining = await get_draws_remaining(user["id"], db)

    await db.commit()

    return {
        "id": str(draw.id),
        "user_id": str(draw.user_id),
        "issue_id": str(draw.issue_id),
        "issue": issue.to_dict(),
        "status": draw.status,
        "source": draw.source,
        "drawn_at": draw.drawn_at.isoformat(),
        "redraws_remaining": draws_remaining,
        "xp_awarded": 5,
        "new_xp": new_xp,
        "new_level": new_level,
    }


@router.post("/draws/{draw_id}/bookmark")
async def bookmark_draw(
    draw_id: str, user: dict = Depends(auth_user), db: AsyncSession = Depends(get_db)
):
    """Bookmark a draw."""
    from sqlalchemy import select

    # Get draw
    draw = await get_draw_by_id(draw_id, user["id"], db)
    if not draw:
        raise HTTPException(status_code=404, detail="Draw not found")

    if draw.status != "drawn":
        raise HTTPException(status_code=400, detail="Can only bookmark drawn issues")

    # Check if user already has active bookmark
    result = await db.execute(
        select(User.active_bookmark_draw_id).where(User.id == UUID(user["id"]))
    )
    existing_bookmark = result.scalar_one_or_none()

    if existing_bookmark:
        raise HTTPException(status_code=400, detail="Release current bookmark first")

    # Update draw
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=7)

    draw.status = "bookmarked"
    draw.bookmarked_at = now

    # Update user's active bookmark
    await db.execute(
        update(User)
        .where(User.id == UUID(user["id"]))
        .values(active_bookmark_draw_id=draw.id, active_bookmark_expires_at=expires)
    )

    # Award XP
    new_xp, new_level = await award_xp(user["id"], 10, db)

    await db.commit()

    return {
        "id": str(draw.id),
        "status": draw.status,
        "bookmarked_at": draw.bookmarked_at.isoformat(),
        "xp_awarded": 10,
        "new_xp": new_xp,
        "new_level": new_level,
    }


@router.post("/draws/{draw_id}/release")
async def release_bookmark(
    draw_id: str, user: dict = Depends(auth_user), db: AsyncSession = Depends(get_db)
):
    """Release a bookmark."""
    from sqlalchemy import update as sql_update

    # Get draw
    draw = await get_draw_by_id(draw_id, user["id"], db)
    if not draw:
        raise HTTPException(status_code=404, detail="Draw not found")

    # Update draw
    draw.status = "expired"
    draw.expired_at = datetime.now(timezone.utc)

    # Clear user's active bookmark
    await db.execute(
        sql_update(User)
        .where(User.id == UUID(user["id"]))
        .values(active_bookmark_draw_id=None, active_bookmark_expires_at=None)
    )

    await db.commit()

    return {"message": "Bookmark released"}


@router.post("/draws/{draw_id}/submit-pr")
async def submit_pr(
    draw_id: str,
    req: SubmitPRRequest,
    user: dict = Depends(auth_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit PR URL for a draw."""
    # Get draw
    draw = await get_draw_by_id(draw_id, user["id"], db)
    if not draw:
        raise HTTPException(status_code=404, detail="Draw not found")

    if draw.status not in ("drawn", "bookmarked"):
        raise HTTPException(status_code=400, detail="Cannot submit PR for this draw")

    # Update draw
    draw.status = "pr_submitted"
    draw.pr_url = req.pr_url
    draw.pr_submitted_at = datetime.now(timezone.utc)

    # Award XP
    new_xp, new_level = await award_xp(user["id"], 25, db)

    await db.commit()

    return {
        "message": "PR submitted",
        "pr_url": req.pr_url,
        "xp_awarded": 25,
        "new_xp": new_xp,
        "new_level": new_level,
    }


@router.post("/draws/{draw_id}/verify")
async def verify_pr(
    draw_id: str, user: dict = Depends(auth_user), db: AsyncSession = Depends(get_db)
):
    """Verify PR merge status via GitHub API."""
    # Get draw
    draw = await get_draw_by_id(draw_id, user["id"], db)
    if not draw:
        raise HTTPException(status_code=404, detail="Draw not found")

    if draw.status != "pr_submitted":
        raise HTTPException(status_code=400, detail="Submit PR first")

    if not draw.pr_url:
        raise HTTPException(status_code=400, detail="No PR URL submitted")

    try:
        # Verify PR with GitHub API
        result = await verify_pr_merge(
            pr_url=draw.pr_url,
            expected_user=user.get("username"),
            access_token=user.get("github_access_token"),
        )

        if not result["verified"]:
            return {
                "verified": False,
                "status": result["status"],
                "message": result["message"],
            }

        # PR is merged! Complete the draw
        now = datetime.now(timezone.utc)
        draw.status = "merged"
        draw.merged_at = now
        draw.merge_commit_sha = result["pr_info"].get("merge_commit_sha")

        # Clear bookmark if this was the active one
        if user.get("active_bookmark", {}).get("draw_id") == draw_id:
            from sqlalchemy import update as sql_update

            await db.execute(
                sql_update(User)
                .where(User.id == UUID(user["id"]))
                .values(active_bookmark_draw_id=None, active_bookmark_expires_at=None)
            )

        # Award XP and update stats
        new_xp, new_level = await award_xp(user["id"], 100, db)

        # Update user's total contributions
        await db.execute(
            sql_update(User)
            .where(User.id == UUID(user["id"]))
            .values(total_contributions=User.total_contributions + 1)
        )

        # Update streak
        await update_streak(user["id"], db)

        # Check for new badges
        new_badges = await check_badges(user["id"], db)

        # Record activity
        activity = Activity(
            user_id=UUID(user["id"]),
            action="merged",
            repo=result["pr_info"].get("repo", ""),
            title=draw.issue.title if draw.issue else "",
            timestamp=now,
            username=user["username"],
            avatar_url=user.get("avatar_url", ""),
        )
        db.add(activity)

        await db.commit()

        return {
            "verified": True,
            "message": "PR verified as merged!",
            "xp_awarded": 100,
            "new_xp": new_xp,
            "new_level": new_level,
            "new_badges": new_badges,
        }

    except GitHubAPIError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/draws/history")
async def get_history(
    user: dict = Depends(auth_user),
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = None,
    language: Optional[str] = None,
):
    """Get user's draw history."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    # Build query
    query = (
        select(Draw)
        .options(selectinload(Draw.issue))
        .where(Draw.user_id == UUID(user["id"]))
    )

    if status:
        query = query.where(Draw.status == status)

    if language:
        query = query.join(Issue).where(Issue.language == language)

    query = query.order_by(Draw.drawn_at.desc()).limit(50)

    result = await db.execute(query)
    draws = result.scalars().all()

    # Get stats
    stats = await get_user_draw_stats(user["id"], db)

    return {
        "draws": [
            {**draw.to_dict(), "issue": draw.issue.to_dict() if draw.issue else None}
            for draw in draws
        ],
        "stats": stats,
    }
