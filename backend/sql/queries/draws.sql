-- name: CreateDraw :one
INSERT INTO draws (user_id, issue_id, status, source)
VALUES ($1, $2, 'drawn', $3)
RETURNING *;

-- name: GetDrawByID :one
SELECT * FROM draws WHERE id = $1;

-- name: GetDrawByPublicID :one
SELECT * FROM draws WHERE public_id = $1;

-- name: GetDrawByPublicIDAndUser :one
SELECT * FROM draws WHERE public_id = $1 AND user_id = $2;

-- name: GetDrawByPRURL :one
SELECT * FROM draws WHERE pr_url = $1 AND status = 'pr_submitted';

-- name: GetDrawByPRIdentity :one
SELECT * FROM draws
WHERE pr_repo_owner = $1 AND pr_repo_name = $2 AND pr_number = $3 AND status = 'pr_submitted';

-- name: GetActivePRClaimByIssue :one
SELECT * FROM draws
WHERE issue_id = $1 AND status = 'pr_submitted' AND user_id <> $2
LIMIT 1;

-- name: UpdateDrawStatus :one
UPDATE draws SET status = $2 WHERE id = $1 AND status = sqlc.arg('current_status') RETURNING *;

-- name: BookmarkDraw :one
UPDATE draws SET status = 'bookmarked', expires_at = $2 WHERE id = $1 AND status = 'drawn' RETURNING *;

-- name: SubmitPR :one
UPDATE draws
SET
  status = 'pr_submitted',
  pr_url = $2,
  pr_submitted_at = NOW(),
  pr_owner_login = $3,
  pr_repo_owner = $4,
  pr_repo_name = $5,
  pr_number = $6,
  pr_verified_at = NOW()
WHERE id = $1 AND status = 'bookmarked'
RETURNING *;

-- name: MergeDraw :one
UPDATE draws
SET
  status = 'merged',
  merged_at = NOW(),
  merge_commit_sha = $2,
  xp_awarded = $3,
  reward_processed_at = NOW(),
  reward_source = $4
WHERE id = $1 AND status = 'pr_submitted' AND reward_processed_at IS NULL
RETURNING *;

-- name: CountDrawsToday :one
SELECT COUNT(*) FROM draws
WHERE user_id = $1 AND created_at >= CURRENT_DATE;

-- name: GetActiveBookmark :one
SELECT * FROM draws
WHERE user_id = $1 AND status = 'bookmarked' AND (expires_at IS NULL OR expires_at > NOW())
LIMIT 1;

-- name: CountActiveWorkForUser :one
SELECT COUNT(*) FROM draws
WHERE user_id = $1
  AND (
    (status = 'bookmarked' AND (expires_at IS NULL OR expires_at > NOW()))
    OR status = 'pr_submitted'
  );

-- name: ListActiveWorkForUser :many
SELECT d.*, i.public_id AS issue_public_id, i.repo_owner, i.repo_name, i.title AS issue_title, i.url AS issue_url, i.language AS issue_language, i.difficulty AS issue_difficulty, i.repo_stars AS issue_repo_stars, i.labels AS issue_labels
FROM draws d
JOIN issues i ON d.issue_id = i.id
WHERE d.user_id = $1
  AND (
    (d.status = 'bookmarked' AND (d.expires_at IS NULL OR d.expires_at > NOW()))
    OR d.status = 'pr_submitted'
  )
ORDER BY
  CASE WHEN d.status = 'pr_submitted' THEN 0 ELSE 1 END,
  COALESCE(d.expires_at, '9999-12-31'::timestamptz) ASC,
  d.created_at DESC,
  d.id DESC;

-- name: ListUserDraws :many
SELECT d.*, i.public_id AS issue_public_id, i.repo_owner, i.repo_name, i.title AS issue_title, i.url AS issue_url, i.language AS issue_language, i.difficulty AS issue_difficulty, i.repo_stars AS issue_repo_stars, i.labels AS issue_labels
FROM draws d
JOIN issues i ON d.issue_id = i.id
WHERE d.user_id = $1
ORDER BY d.created_at DESC, d.id DESC
LIMIT $2;

-- name: ListUserDrawsAfterCursor :many
SELECT d.*, i.public_id AS issue_public_id, i.repo_owner, i.repo_name, i.title AS issue_title, i.url AS issue_url, i.language AS issue_language, i.difficulty AS issue_difficulty, i.repo_stars AS issue_repo_stars, i.labels AS issue_labels
FROM draws d
JOIN issues i ON d.issue_id = i.id
WHERE d.user_id = $1 AND (d.created_at < $2 OR (d.created_at = $2 AND d.id < sqlc.arg('cursor_id')::bigint))
ORDER BY d.created_at DESC, d.id DESC
LIMIT $3;

-- name: ListUserDrawsByStatus :many
SELECT d.*, i.public_id AS issue_public_id, i.repo_owner, i.repo_name, i.title AS issue_title, i.url AS issue_url, i.language AS issue_language, i.difficulty AS issue_difficulty, i.repo_stars AS issue_repo_stars, i.labels AS issue_labels
FROM draws d
JOIN issues i ON d.issue_id = i.id
WHERE d.user_id = $1 AND d.status = $2
ORDER BY d.created_at DESC, d.id DESC
LIMIT $3;

-- name: CountUserDraws :one
SELECT COUNT(*) FROM draws WHERE user_id = $1;

-- name: CountUserMergedDraws :one
SELECT COUNT(*) FROM draws WHERE user_id = $1 AND status = 'merged';

-- name: CountMergedDraws :one
SELECT COUNT(*) FROM draws WHERE status = 'merged';

-- name: GetUserMergedDrawsWithIssues :many
SELECT d.id, d.public_id, d.created_at, d.merged_at, d.xp_awarded, i.repo_owner, i.repo_name, i.language, i.labels, i.difficulty
FROM draws d
JOIN issues i ON d.issue_id = i.id
WHERE d.user_id = $1 AND d.status = 'merged'
ORDER BY d.merged_at DESC;

-- name: GetRecentMergedDrawsWithIssues :many
SELECT d.id, d.public_id, d.created_at, d.merged_at, d.xp_awarded, i.repo_owner, i.repo_name, i.language, i.labels, i.difficulty
FROM draws d
JOIN issues i ON d.issue_id = i.id
WHERE d.user_id = $1 AND d.status = 'merged'
ORDER BY d.merged_at DESC
LIMIT $2;

-- name: GetUserDrawStats :one
SELECT
    COUNT(*) AS total_draws,
    COUNT(*) FILTER (WHERE status IN ('bookmarked', 'pr_submitted', 'merged')) AS bookmarked_count,
    COUNT(*) FILTER (WHERE status = 'merged') AS merged_count
FROM draws
WHERE user_id = $1;

-- name: GetUserHeatmap :many
SELECT DATE(created_at) AS day, COUNT(*) AS count
FROM draws
WHERE user_id = $1 AND created_at >= $2
GROUP BY DATE(created_at)
ORDER BY day;
