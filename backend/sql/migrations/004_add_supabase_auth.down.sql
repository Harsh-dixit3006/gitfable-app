-- Remove auth_id column and index
DROP INDEX IF EXISTS idx_users_auth_id;
ALTER TABLE users DROP COLUMN IF EXISTS auth_id;
