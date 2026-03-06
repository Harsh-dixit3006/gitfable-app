import hmac
import hashlib
from typing import Dict, Any
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, Header
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import GITHUB_CLIENT_SECRET
from app.database import AsyncSessionLocal
from app.models.database import Draw, User, Activity
from app.services.xp import award_xp
from app.services.badges import check_badges
from app.services.streaks import update_streak

router = APIRouter(prefix="/api")


def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verify GitHub webhook signature."""
    if not signature:
        return False

    expected_signature = (
        f"sha256={hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()}"
    )
    return hmac.compare_digest(signature, expected_signature)


@router.post("/webhooks/github")
async def github_webhook(
    request: Request,
    x_github_event: str = Header(None),
    x_hub_signature_256: str = Header(None),
    x_github_delivery: str = Header(None),
):
    """Handle GitHub webhook events."""
    # Read raw payload
    payload = await request.body()

    # Verify signature (skip in development if no secret)
    if GITHUB_CLIENT_SECRET and x_hub_signature_256:
        if not verify_webhook_signature(
            payload, x_hub_signature_256, GITHUB_CLIENT_SECRET
        ):
            raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse JSON payload
    data = await request.json()
    event_type = x_github_event or "unknown"

    if event_type == "pull_request":
        return await handle_pull_request_event(data)
    elif event_type == "ping":
        return {"message": "Webhook received"}
    else:
        return {"message": f"Event {event_type} ignored"}


async def handle_pull_request_event(data: Dict[str, Any]):
    """Handle pull_request webhook events."""
    action = data.get("action")
    pr = data.get("pull_request", {})

    if action not in ["closed"]:
        return {"message": f"PR action {action} ignored"}

    # Only process merged PRs
    if not pr.get("merged"):
        return {"message": "PR was closed without merging"}

    # Extract PR info
    pr_url = pr.get("html_url")
    if not pr_url:
        return {"message": "No PR URL in payload"}

    # Process in database
    async with AsyncSessionLocal() as db:
        try:
            # Find draw with this PR URL
            result = await db.execute(
                select(Draw)
                .options(selectinload(Draw.user), selectinload(Draw.issue))
                .where(Draw.pr_url == pr_url)
                .where(Draw.status == "pr_submitted")
            )
            draw = result.scalar_one_or_none()

            if not draw:
                return {"message": "PR not associated with any draw"}

            user = draw.user
            if not user:
                return {"message": "User not found for draw"}

            # PR is merged! Update the draw
            now = datetime.now(timezone.utc)
            draw.status = "merged"
            draw.merged_at = now
            draw.merge_commit_sha = pr.get("merge_commit_sha")

            # Clear user's active bookmark if this was it
            if user.active_bookmark_draw_id == draw.id:
                await db.execute(
                    update(User)
                    .where(User.id == user.id)
                    .values(
                        active_bookmark_draw_id=None, active_bookmark_expires_at=None
                    )
                )

            # Award XP
            await award_xp(str(user.id), 100, db)

            # Update user stats
            await db.execute(
                update(User)
                .where(User.id == user.id)
                .values(total_contributions=User.total_contributions + 1)
            )

            # Update streak
            await update_streak(str(user.id), db)

            # Check for new badges
            new_badges = await check_badges(str(user.id), db)

            # Record activity
            activity = Activity(
                user_id=user.id,
                action="merged",
                repo=draw.issue.repo if draw.issue else "",
                title=draw.issue.title if draw.issue else pr.get("title", ""),
                timestamp=now,
                username=user.username,
                avatar_url=user.avatar_url,
            )
            db.add(activity)

            await db.commit()

            return {
                "message": "PR merged automatically via webhook",
                "draw_id": str(draw.id),
                "xp_awarded": 100,
                "new_badges": new_badges,
            }

        except Exception as e:
            await db.rollback()
            raise HTTPException(
                status_code=500, detail=f"Webhook processing failed: {str(e)}"
            )
