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

-- name: UpdateDrawStatus :one
UPDATE draws SET status = $2 WHERE id = $1 RETURNING *;

-- name: BookmarkDraw :one
UPDATE draws SET status = 'bookmarked', expires_at = $2 WHERE id = $1 AND status = 'drawn' RETURNING *;

-- name: SubmitPR :one
UPDATE draws SET status = 'pr_submitted', pr_url = $2, pr_submitted_at = NOW() WHERE id = $1 RETURNING *;

-- name: MergeDraw :one
UPDATE draws SET status = 'merged', merged_at = NOW(), merge_commit_sha = $2, xp_awarded = $3 WHERE id = $1 RETURNING *;

-- name: CountDrawsToday :one
SELECT COUNT(*) FROM draws
WHERE user_id = $1 AND created_at >= CURRENT_DATE AND source = 'draw';

-- name: GetActiveBookmark :one
SELECT * FROM draws
WHERE user_id = $1 AND status = 'bookmarked' AND (expires_at IS NULL OR expires_at > NOW())
LIMIT 1;

-- name: ListUserDraws :many
SELECT d.*, i.public_id AS issue_public_id, i.repo_owner, i.repo_name, i.title AS issue_title, i.url AS issue_url, i.language AS issue_language, i.difficulty AS issue_difficulty, i.repo_stars AS issue_repo_stars, i.labels AS issue_labels
FROM draws d
JOIN issues i ON d.issue_id = i.id
WHERE d.user_id = $1
ORDER BY d.created_at DESC
LIMIT $2;

-- name: ListUserDrawsAfterCursor :many
SELECT d.*, i.public_id AS issue_public_id, i.repo_owner, i.repo_name, i.title AS issue_title, i.url AS issue_url, i.language AS issue_language, i.difficulty AS issue_difficulty, i.repo_stars AS issue_repo_stars, i.labels AS issue_labels
FROM draws d
JOIN issues i ON d.issue_id = i.id
WHERE d.user_id = $1 AND (d.created_at, d.id) < ($2, $3)
ORDER BY d.created_at DESC, d.id DESC
LIMIT $4;

-- name: ListUserDrawsByStatus :many
SELECT d.*, i.public_id AS issue_public_id, i.repo_owner, i.repo_name, i.title AS issue_title, i.url AS issue_url, i.language AS issue_language, i.difficulty AS issue_difficulty, i.repo_stars AS issue_repo_stars, i.labels AS issue_labels
FROM draws d
JOIN issues i ON d.issue_id = i.id
WHERE d.user_id = $1 AND d.status = $2
ORDER BY d.created_at DESC
LIMIT $3;

-- name: CountUserDraws :one
SELECT COUNT(*) FROM draws WHERE user_id = $1;

-- name: CountUserMergedDraws :one
SELECT COUNT(*) FROM draws WHERE user_id = $1 AND status = 'merged';

-- name: CountMergedDraws :one
SELECT COUNT(*) FROM draws WHERE status = 'merged';

-- name: GetUserMergedDrawsWithIssues :many
SELECT d.id, d.created_at, d.merged_at, d.xp_awarded, i.repo_owner, i.repo_name, i.language, i.labels, i.difficulty
FROM draws d
JOIN issues i ON d.issue_id = i.id
WHERE d.user_id = $1 AND d.status = 'merged'
ORDER BY d.merged_at DESC;

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
