ALTER TABLE draws
ADD COLUMN pr_owner_login VARCHAR(39),
ADD COLUMN pr_repo_owner VARCHAR(255),
ADD COLUMN pr_repo_name VARCHAR(255),
ADD COLUMN pr_number INTEGER,
ADD COLUMN pr_verified_at TIMESTAMPTZ,
ADD COLUMN reward_processed_at TIMESTAMPTZ,
ADD COLUMN reward_source VARCHAR(20);

CREATE INDEX idx_draws_issue_active_pr ON draws(issue_id) WHERE status = 'pr_submitted';
CREATE UNIQUE INDEX idx_draws_active_pr_identity
ON draws(pr_repo_owner, pr_repo_name, pr_number)
WHERE status = 'pr_submitted' AND pr_number IS NOT NULL;
