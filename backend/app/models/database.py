"""SQLAlchemy models for PostgreSQL database."""

import uuid
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Text,
    Index,
    JSON,
    create_engine,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.sql import func

Base = declarative_base()


def generate_uuid():
    """Generate a UUID string."""
    return str(uuid.uuid4())


def get_current_timestamp():
    """Get current UTC timestamp."""
    return datetime.now(timezone.utc)


class User(Base):
    """User model."""

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firebase_uid = Column(String(128), unique=True, nullable=False, index=True)
    username = Column(String(39), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    avatar_url = Column(Text, nullable=True)

    # GitHub OAuth info
    github_id = Column(String(64), unique=True, nullable=True, index=True)
    github_username = Column(String(39), unique=True, nullable=True)
    github_access_token = Column(Text, nullable=True)

    # Stats
    xp = Column(Integer, default=0, nullable=False)
    level = Column(Integer, default=1, nullable=False)
    current_streak = Column(Integer, default=0, nullable=False)
    longest_streak = Column(Integer, default=0, nullable=False)
    last_contribution_date = Column(DateTime(timezone=True), nullable=True)
    total_contributions = Column(Integer, default=0, nullable=False)

    # Filters stored as JSON
    filters = Column(JSONB, default=dict, nullable=False)

    # Active bookmark
    active_bookmark_draw_id = Column(
        UUID(as_uuid=True), ForeignKey("draws.id"), nullable=True
    )
    active_bookmark_expires_at = Column(DateTime(timezone=True), nullable=True)

    # Draw limits
    last_redraw_date = Column(Date, nullable=True)
    redraws_today = Column(Integer, default=0, nullable=False)

    # Timestamps
    joined_at = Column(
        DateTime(timezone=True), default=get_current_timestamp, nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=get_current_timestamp,
        onupdate=get_current_timestamp,
        nullable=False,
    )

    # Status
    disabled = Column(Boolean, default=False, nullable=False)

    # Relationships
    draws = relationship("Draw", back_populates="user", foreign_keys="Draw.user_id")
    badges = relationship(
        "UserBadge", back_populates="user", cascade="all, delete-orphan"
    )
    activities = relationship("Activity", back_populates="user")

    def to_dict(self):
        """Convert to dictionary."""
        return {
            "id": str(self.id),
            "firebase_uid": self.firebase_uid,
            "username": self.username,
            "email": self.email,
            "display_name": self.display_name,
            "avatar_url": self.avatar_url,
            "github_id": self.github_id,
            "github_username": self.github_username,
            "xp": self.xp,
            "level": self.level,
            "current_streak": self.current_streak,
            "longest_streak": self.longest_streak,
            "last_contribution_date": self.last_contribution_date.isoformat()
            if self.last_contribution_date
            else None,
            "total_contributions": self.total_contributions,
            "filters": self.filters,
            "active_bookmark": {
                "draw_id": str(self.active_bookmark_draw_id)
                if self.active_bookmark_draw_id
                else None,
                "expires_at": self.active_bookmark_expires_at.isoformat()
                if self.active_bookmark_expires_at
                else None,
            }
            if self.active_bookmark_draw_id
            else None,
            "joined_at": self.joined_at.isoformat() if self.joined_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "disabled": self.disabled,
        }


class Badge(Base):
    """Badge definition model."""

    __tablename__ = "badges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=False)
    icon = Column(String(50), nullable=False)

    # Relationships
    user_badges = relationship("UserBadge", back_populates="badge")

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "description": self.description,
            "icon": self.icon,
        }


class UserBadge(Base):
    """User-badge relationship (many-to-many)."""

    __tablename__ = "user_badges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    badge_id = Column(UUID(as_uuid=True), ForeignKey("badges.id"), nullable=False)
    earned_at = Column(
        DateTime(timezone=True), default=get_current_timestamp, nullable=False
    )

    # Relationships
    user = relationship("User", back_populates="badges")
    badge = relationship("Badge", back_populates="user_badges")

    __table_args__ = (
        Index("idx_user_badge_unique", "user_id", "badge_id", unique=True),
    )


class Issue(Base):
    """Cached GitHub issue model."""

    __tablename__ = "issues"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    github_id = Column(Integer, nullable=False, unique=True, index=True)
    repo = Column(String(255), nullable=False, index=True)
    title = Column(Text, nullable=False)
    url = Column(Text, nullable=False)
    language = Column(String(50), nullable=True, index=True)
    difficulty = Column(String(20), nullable=True, index=True)
    stars = Column(Integer, default=0, nullable=False)
    labels = Column(ARRAY(String), default=list, nullable=False)

    # Sync tracking
    synced_at = Column(
        DateTime(timezone=True), default=get_current_timestamp, nullable=False
    )

    # Relationships
    draws = relationship("Draw", back_populates="issue")

    def to_dict(self):
        return {
            "id": str(self.id),
            "github_id": self.github_id,
            "repo": self.repo,
            "title": self.title,
            "url": self.url,
            "language": self.language,
            "difficulty": self.difficulty,
            "stars": self.stars,
            "labels": self.labels,
            "synced_at": self.synced_at.isoformat() if self.synced_at else None,
        }


class Draw(Base):
    """Draw/issue selection model."""

    __tablename__ = "draws"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    issue_id = Column(
        UUID(as_uuid=True), ForeignKey("issues.id"), nullable=False, index=True
    )

    # Status: drawn, bookmarked, pr_submitted, merged, expired
    status = Column(String(20), default="drawn", nullable=False, index=True)
    source = Column(String(20), default="draw", nullable=False)  # draw or choose

    # PR tracking
    pr_url = Column(Text, nullable=True)
    pr_submitted_at = Column(DateTime(timezone=True), nullable=True)
    merge_commit_sha = Column(String(255), nullable=True)

    # Bookmark tracking
    bookmarked_at = Column(DateTime(timezone=True), nullable=True)
    expired_at = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    drawn_at = Column(
        DateTime(timezone=True), default=get_current_timestamp, nullable=False
    )
    merged_at = Column(DateTime(timezone=True), nullable=True)

    # XP tracking
    xp_awarded = Column(Integer, nullable=True)

    # Relationships
    user = relationship("User", back_populates="draws", foreign_keys=[user_id])
    issue = relationship("Issue", back_populates="draws")

    __table_args__ = (
        Index("idx_draws_user_status", "user_id", "status"),
        Index("idx_draws_user_drawn", "user_id", "drawn_at"),
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "issue_id": str(self.issue_id),
            "status": self.status,
            "source": self.source,
            "pr_url": self.pr_url,
            "pr_submitted_at": self.pr_submitted_at.isoformat()
            if self.pr_submitted_at
            else None,
            "merge_commit_sha": self.merge_commit_sha,
            "bookmarked_at": self.bookmarked_at.isoformat()
            if self.bookmarked_at
            else None,
            "expired_at": self.expired_at.isoformat() if self.expired_at else None,
            "drawn_at": self.drawn_at.isoformat() if self.drawn_at else None,
            "merged_at": self.merged_at.isoformat() if self.merged_at else None,
            "xp_awarded": self.xp_awarded,
        }


class Activity(Base):
    """Activity feed model."""

    __tablename__ = "activities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    action = Column(String(50), nullable=False)  # merged, bookmarked, etc.
    repo = Column(String(255), nullable=True)
    title = Column(Text, nullable=True)
    timestamp = Column(
        DateTime(timezone=True),
        default=get_current_timestamp,
        nullable=False,
        index=True,
    )

    # Cached user info for display
    username = Column(String(39), nullable=False)
    avatar_url = Column(Text, nullable=True)

    # Relationships
    user = relationship("User", back_populates="activities")

    __table_args__ = (Index("idx_activities_user_time", "user_id", "timestamp"),)

    def to_dict(self):
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "username": self.username,
            "avatar_url": self.avatar_url,
            "action": self.action,
            "repo": self.repo,
            "title": self.title,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }


class OAuthState(Base):
    """OAuth state parameter for CSRF protection (if needed for non-Firebase OAuth)."""

    __tablename__ = "oauth_states"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    state = Column(String(255), unique=True, nullable=False, index=True)
    created_at = Column(
        DateTime(timezone=True), default=get_current_timestamp, nullable=False
    )
    used = Column(Boolean, default=False, nullable=False)
