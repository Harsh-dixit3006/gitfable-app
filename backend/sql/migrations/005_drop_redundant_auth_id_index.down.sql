-- Recreate non-unique auth_id index if rolling back this cleanup migration.
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
