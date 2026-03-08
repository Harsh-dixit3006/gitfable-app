# Draw Limit Overrides

GitFable supports a global default draw cap plus per-user overrides.

## Global Default

Set the fallback daily draw cap for all users:

```bash
DEFAULT_DAILY_DRAW_LIMIT=3
```

If a user does not have a custom `daily_draw_limit`, the backend uses this value.

## Dev Seed Overrides

In non-production environments, you can seed per-user draw limits on startup with:

```bash
SEED_DAILY_DRAW_LIMITS=nishantg96:5,tester:7
```

Format:

- comma-separated `username:limit` pairs
- usernames are matched case-insensitively
- limits must be positive integers

This runs during backend startup in development and updates existing users in the database.

## Manual SQL Override

For one-off changes, run SQL directly:

```sql
UPDATE users
SET daily_draw_limit = 5
WHERE LOWER(username) = LOWER('nishantg96');
```

To remove a user-specific override and fall back to the global default:

```sql
UPDATE users
SET daily_draw_limit = NULL
WHERE LOWER(username) = LOWER('nishantg96');
```
