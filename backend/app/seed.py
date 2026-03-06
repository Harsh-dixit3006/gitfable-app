"""Seed script for PostgreSQL database."""

import uuid
import random
from datetime import datetime, timezone, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Issue, Badge, User, Draw, Activity


def mock_issues() -> list[Issue]:
    """Generate mock issues for seeding."""
    data = [
        (
            "facebook/react",
            "Fix accessibility labels in Dialog component",
            215000,
            "JavaScript",
            ["good first issue", "accessibility"],
            "Beginner",
        ),
        (
            "microsoft/vscode",
            "Add keyboard shortcut for folder collapse",
            155000,
            "TypeScript",
            ["good first issue", "feature-request"],
            "Beginner",
        ),
        (
            "rust-lang/rust",
            "Improve borrow checker error hint",
            89000,
            "Rust",
            ["good first issue", "diagnostics"],
            "Intermediate",
        ),
        (
            "django/django",
            "Add test for DateTimeField edge case",
            74000,
            "Python",
            ["good first issue", "tests"],
            "Beginner",
        ),
        (
            "golang/go",
            "Document context cancellation in net/http",
            118000,
            "Go",
            ["documentation", "help wanted"],
            "Intermediate",
        ),
        (
            "vercel/next.js",
            "Fix hydration mismatch in App Router",
            120000,
            "TypeScript",
            ["good first issue", "bug"],
            "Intermediate",
        ),
        (
            "pallets/flask",
            "Improve Blueprint error handling",
            65000,
            "Python",
            ["good first issue", "enhancement"],
            "Beginner",
        ),
        (
            "tokio-rs/tokio",
            "Add TcpStream connect timeout config",
            23000,
            "Rust",
            ["help wanted", "enhancement"],
            "Advanced",
        ),
        (
            "sveltejs/svelte",
            "Fix transition animation on mount",
            76000,
            "JavaScript",
            ["good first issue", "bug"],
            "Intermediate",
        ),
        (
            "denoland/deno",
            "Add permission prompt for --allow-ffi",
            92000,
            "TypeScript",
            ["good first issue", "security"],
            "Beginner",
        ),
        (
            "fastapi/fastapi",
            "Document WebSocket dependency injection",
            68000,
            "Python",
            ["documentation", "good first issue"],
            "Beginner",
        ),
        (
            "pytorch/pytorch",
            "Fix CUDA memory leak in autograd",
            76000,
            "Python",
            ["module: autograd", "bug"],
            "Advanced",
        ),
        (
            "kubernetes/kubernetes",
            "Add unit tests for scheduler plugin",
            105000,
            "Go",
            ["good first issue", "area/test"],
            "Intermediate",
        ),
        (
            "tauri-apps/tauri",
            "Fix window resize on macOS Sonoma",
            75000,
            "Rust",
            ["bug", "platform: macOS"],
            "Advanced",
        ),
        (
            "expressjs/express",
            "Update README for ES modules syntax",
            63000,
            "JavaScript",
            ["good first issue", "documentation"],
            "Beginner",
        ),
        (
            "ansible/ansible",
            "Add docker_container idempotency test",
            59000,
            "Python",
            ["good first issue", "module"],
            "Intermediate",
        ),
        (
            "rails/rails",
            "Fix N+1 query in ActionMailbox routing",
            54000,
            "Ruby",
            ["bug", "actionmailbox"],
            "Advanced",
        ),
        (
            "flutter/flutter",
            "Improve missing asset error message",
            160000,
            "Dart",
            ["good first issue", "tool"],
            "Beginner",
        ),
        (
            "elixir-lang/elixir",
            "Add Stream.resource/3 doc example",
            23000,
            "Elixir",
            ["documentation", "good first issue"],
            "Beginner",
        ),
        (
            "apache/kafka",
            "Optimize consumer group rebalance",
            27000,
            "Java",
            ["help wanted", "consumer"],
            "Advanced",
        ),
        (
            "vitejs/vite",
            "Fix HMR for CSS modules with postcss",
            64000,
            "TypeScript",
            ["good first issue", "bug"],
            "Intermediate",
        ),
        (
            "prisma/prisma",
            "Add composite type schema validation",
            36000,
            "TypeScript",
            ["good first issue", "enhancement"],
            "Intermediate",
        ),
        (
            "neovim/neovim",
            "Fix floating window border on resize",
            74000,
            "C",
            ["bug", "tui"],
            "Advanced",
        ),
        (
            "gin-gonic/gin",
            "Document middleware execution order",
            75000,
            "Go",
            ["documentation", "good first issue"],
            "Beginner",
        ),
        (
            "scikit-learn/scikit-learn",
            "Fix cross-validation imbalanced data",
            57000,
            "Python",
            ["help wanted", "enhancement"],
            "Intermediate",
        ),
        (
            "huggingface/transformers",
            "Fix tokenizer padding for batch",
            120000,
            "Python",
            ["good first issue", "bug"],
            "Intermediate",
        ),
        (
            "spring-projects/spring-boot",
            "Add virtual threads autoconfig",
            72000,
            "Java",
            ["enhancement", "help wanted"],
            "Intermediate",
        ),
        (
            "grafana/grafana",
            "Fix dashboard variable in alerting",
            59000,
            "TypeScript",
            ["bug", "area/alerting"],
            "Advanced",
        ),
    ]

    issues = []
    for i, d in enumerate(data):
        issue = Issue(
            id=uuid.uuid4(),
            github_id=random.randint(100000, 999999),
            repo=d[0],
            title=d[1],
            stars=d[2],
            language=d[3],
            labels=d[4],
            difficulty=d[5],
            url=f"https://github.com/{d[0]}/issues/{random.randint(1000, 9999)}",
            synced_at=datetime.now(timezone.utc),
        )
        issues.append(issue)

    return issues


def mock_users() -> list[User]:
    """Generate mock users for seeding."""
    names = [
        "sarah-chen",
        "alex-rust",
        "dev-maya",
        "code-ninja",
        "byte-smith",
        "luna-dev",
        "max-code",
        "pixel-jane",
    ]

    users = []
    for n in names:
        xp = random.randint(50, 5000)
        user = User(
            id=uuid.uuid4(),
            firebase_uid=str(uuid.uuid4()),
            username=n,
            display_name=n.replace("-", " ").title(),
            email=f"{n}@example.com",
            avatar_url=f"https://api.dicebear.com/7.x/identicon/svg?seed={n}",
            xp=xp,
            level=(xp // 500) + 1,
            current_streak=random.randint(0, 30),
            longest_streak=random.randint(5, 60),
            last_contribution_date=datetime.now(timezone.utc)
            - timedelta(days=random.randint(0, 5)),
            total_contributions=random.randint(1, 50),
            filters={"languages": [], "difficulties": []},
            disabled=False,
        )
        users.append(user)

    return users


def mock_activity() -> list[Activity]:
    """Generate mock activity for seeding."""
    repos = [
        "facebook/react",
        "microsoft/vscode",
        "vercel/next.js",
        "django/django",
        "rust-lang/rust",
    ]
    titles = [
        "Fix accessibility labels",
        "Add keyboard shortcut",
        "Fix hydration warning",
        "Add test coverage",
        "Improve error message",
    ]
    usernames = ["sarah-chen", "alex-rust", "dev-maya", "code-ninja", "byte-smith"]

    activities = []
    for _ in range(8):
        u = random.choice(usernames)
        activity = Activity(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),  # Will need to match actual user IDs
            action="merged",
            repo=random.choice(repos),
            title=random.choice(titles),
            timestamp=datetime.now(timezone.utc)
            - timedelta(hours=random.randint(1, 48)),
            username=u,
            avatar_url=f"https://api.dicebear.com/7.x/identicon/svg?seed={u}",
        )
        activities.append(activity)

    return activities


async def seed_database(db: AsyncSession):
    """Seed the database with initial data."""
    print("Seeding database...")

    # Check if we already have issues
    result = await db.execute(select(Issue).limit(1))
    if result.scalar_one_or_none():
        print("Database already seeded, skipping...")
        return

    # Seed issues
    issues = mock_issues()
    for issue in issues:
        db.add(issue)
    print(f"Seeded {len(issues)} issues")

    # Seed badges
    from app.services.badges import BADGES_META

    for badge_meta in BADGES_META:
        badge = Badge(
            name=badge_meta["name"],
            description=badge_meta["description"],
            icon=badge_meta["icon"],
        )
        db.add(badge)
    print(f"Seeded {len(BADGES_META)} badges")

    # Commit to get IDs
    await db.commit()

    # Seed users
    users = mock_users()
    for user in users:
        db.add(user)
    await db.commit()
    print(f"Seeded {len(users)} users")

    print("Database seeding complete!")


async def clear_database(db: AsyncSession):
    """Clear all data from database (use with caution!)."""
    print("Clearing database...")

    await db.execute("DELETE FROM activities")
    await db.execute("DELETE FROM user_badges")
    await db.execute("DELETE FROM badges")
    await db.execute("DELETE FROM draws")
    await db.execute("DELETE FROM issues")
    await db.execute("DELETE FROM users")

    await db.commit()
    print("Database cleared!")
