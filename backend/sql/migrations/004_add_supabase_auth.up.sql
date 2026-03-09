-- Add auth_id column to users table
ALTER TABLE users ADD COLUMN auth_id VARCHAR(128) UNIQUE;

-- Migrate data: copy firebase_uid to auth_id
UPDATE users SET auth_id = firebase_uid;

-- Make auth_id NOT NULL after migration
ALTER TABLE users ALTER COLUMN auth_id SET NOT NULL;

-- Create index on auth_id
CREATE INDEX idx_users_auth_id ON users(auth_id);

-- Note: We'll keep firebase_uid for now as backup, remove in future migration
