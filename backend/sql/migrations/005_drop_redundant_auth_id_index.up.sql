-- Drop redundant non-unique index on auth_id.
-- auth_id already has a UNIQUE constraint from migration 004, which provides indexing.
DROP INDEX IF EXISTS idx_users_auth_id;
