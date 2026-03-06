"""Database indexes and utilities for PostgreSQL.

PostgreSQL indexes are created automatically by SQLAlchemy
when tables are created, so this module mainly provides
checks and utilities.
"""

from sqlalchemy import inspect, text

from app.database import engine


async def create_indexes():
    """Verify database is initialized.

    In PostgreSQL, indexes are created automatically when tables
    are created via SQLAlchemy, so this just verifies the connection.
    """
    print("Checking database indexes...")

    async with engine.connect() as conn:
        # Test connection
        result = await conn.execute(text("SELECT 1"))
        await result.fetchone()

    print("Database connection verified!")


async def list_indexes():
    """List all indexes in the database."""
    async with engine.connect() as conn:
        result = await conn.execute(
            text("""
            SELECT 
                schemaname,
                tablename,
                indexname,
                indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
            ORDER BY tablename, indexname;
        """)
        )
        indexes = result.fetchall()

        print("\nDatabase Indexes:")
        print("-" * 80)
        for idx in indexes:
            print(f"{idx[1]}.{idx[2]}")
        print("-" * 80)
        print(f"Total: {len(indexes)} indexes")


async def get_table_stats():
    """Get statistics about tables."""
    async with engine.connect() as conn:
        result = await conn.execute(
            text("""
            SELECT 
                relname as table_name,
                n_live_tup as row_count
            FROM pg_stat_user_tables
            WHERE schemaname = 'public'
            ORDER BY n_live_tup DESC;
        """)
        )
        stats = result.fetchall()

        print("\nTable Statistics:")
        print("-" * 40)
        print(f"{'Table':<20} {'Row Count':<10}")
        print("-" * 40)
        for stat in stats:
            print(f"{stat[0]:<20} {stat[1]:<10}")
        print("-" * 40)
