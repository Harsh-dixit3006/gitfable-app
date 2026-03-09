DROP INDEX IF EXISTS idx_draws_active_pr_identity;
DROP INDEX IF EXISTS idx_draws_issue_active_pr;

ALTER TABLE draws
DROP COLUMN IF EXISTS reward_source,
DROP COLUMN IF EXISTS reward_processed_at,
DROP COLUMN IF EXISTS pr_verified_at,
DROP COLUMN IF EXISTS pr_number,
DROP COLUMN IF EXISTS pr_repo_name,
DROP COLUMN IF EXISTS pr_repo_owner,
DROP COLUMN IF EXISTS pr_owner_login;
