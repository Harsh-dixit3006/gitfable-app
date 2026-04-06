-- Migrate auth_id from Supabase UIDs to GitHub user IDs.
-- The github_id column already stores the numeric GitHub user ID (as string).
-- After this migration, auth_id is used for GitHub OAuth lookup.
-- NOTE: This is a one-way migration. Supabase UIDs are not recoverable.
UPDATE users SET auth_id = github_id
WHERE github_id IS NOT NULL AND github_id != '';
