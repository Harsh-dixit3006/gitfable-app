-- name: GetIssueByID :one
SELECT * FROM issues WHERE id = $1;

-- name: GetIssueByPublicID :one
SELECT * FROM issues WHERE public_id = $1;

-- name: CountFilteredIssues :one
SELECT COUNT(*) FROM issues
WHERE state = 'open'
  AND (sqlc.narg('language')::varchar IS NULL OR language = sqlc.narg('language'))
  AND (sqlc.narg('difficulty')::varchar IS NULL OR difficulty = sqlc.narg('difficulty'));

-- name: GetRandomIssue :one
SELECT * FROM issues
WHERE state = 'open'
  AND (sqlc.narg('language')::varchar IS NULL OR language = sqlc.narg('language'))
  AND (sqlc.narg('difficulty')::varchar IS NULL OR difficulty = sqlc.narg('difficulty'))
OFFSET $1
LIMIT 1;

-- name: ListIssues :many
-- Browse table: excludes legendary-rarity issues (draw-only).
SELECT * FROM issues
WHERE state = 'open'
  AND rarity != 'legendary'
  AND (sqlc.narg('language')::varchar IS NULL OR language = sqlc.narg('language'))
  AND (sqlc.narg('difficulty')::varchar IS NULL OR difficulty = sqlc.narg('difficulty'))
  AND (sqlc.narg('rarity')::varchar IS NULL OR rarity = sqlc.narg('rarity'))
ORDER BY repo_stars DESC, id DESC
LIMIT $1;

-- name: ListIssuesAfterCursor :many
SELECT * FROM issues
WHERE state = 'open'
  AND rarity != 'legendary'
  AND (sqlc.narg('language')::varchar IS NULL OR language = sqlc.narg('language'))
  AND (sqlc.narg('difficulty')::varchar IS NULL OR difficulty = sqlc.narg('difficulty'))
  AND (sqlc.narg('rarity')::varchar IS NULL OR rarity = sqlc.narg('rarity'))
  AND (repo_stars < $1 OR (repo_stars = $1 AND id < sqlc.arg('cursor_id')::bigint))
ORDER BY repo_stars DESC, id DESC
LIMIT $2;

-- name: CountDistinctRepos :one
SELECT COUNT(DISTINCT (repo_owner, repo_name)) FROM issues WHERE state = 'open';

-- name: CreateIssue :one
INSERT INTO issues (github_id, github_number, repo_owner, repo_name, title, url, language, difficulty, rarity, repo_stars, repo_pushed_at, github_created_at, labels, state)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING *;

-- name: CountIssues :one
SELECT COUNT(*) FROM issues;

-- name: UpsertIssue :one
INSERT INTO issues (
    github_id, github_number, repo_owner, repo_name, title, url,
    language, difficulty, rarity, repo_stars, repo_pushed_at, github_created_at,
    labels, state, last_synced_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
ON CONFLICT (github_id) DO UPDATE SET
    title = EXCLUDED.title,
    repo_stars = EXCLUDED.repo_stars,
    labels = EXCLUDED.labels,
    difficulty = EXCLUDED.difficulty,
    rarity = EXCLUDED.rarity,
    repo_pushed_at = EXCLUDED.repo_pushed_at,
    last_synced_at = NOW(),
    state = EXCLUDED.state
RETURNING *;

-- name: GetStaleIssues :many
SELECT * FROM issues
WHERE state = 'open'
ORDER BY last_synced_at ASC
LIMIT $1;

-- name: MarkIssueClosed :exec
UPDATE issues SET state = 'closed', last_synced_at = NOW() WHERE id = $1;

-- name: UpdateIssueSyncedAt :exec
UPDATE issues SET last_synced_at = NOW() WHERE id = $1;

-- name: CountOpenIssues :one
SELECT COUNT(*) FROM issues WHERE state = 'open';

-- name: CountOpenIssuesByLanguage :many
SELECT language, COUNT(*) as count FROM issues WHERE state = 'open' GROUP BY language ORDER BY count DESC;

-- name: CountFilteredIssuesForUser :one
SELECT COUNT(*) FROM issues
WHERE state = 'open'
  AND (sqlc.narg('language')::varchar IS NULL OR language = sqlc.narg('language'))
  AND (sqlc.narg('difficulty')::varchar IS NULL OR difficulty = sqlc.narg('difficulty'))
  AND NOT EXISTS (
    SELECT 1 FROM draws d WHERE d.issue_id = issues.id AND d.user_id = $1
  );

-- name: GetRandomIssueForUser :one
SELECT * FROM issues
WHERE state = 'open'
  AND (sqlc.narg('language')::varchar IS NULL OR language = sqlc.narg('language'))
  AND (sqlc.narg('difficulty')::varchar IS NULL OR difficulty = sqlc.narg('difficulty'))
  AND NOT EXISTS (
    SELECT 1 FROM draws d WHERE d.issue_id = issues.id AND d.user_id = $1
  )
OFFSET $2
LIMIT 1;

-- name: CountIssuesByRarityForUser :many
-- Returns count of available issues per rarity tier for weighted draw selection.
SELECT rarity, COUNT(*)::bigint as count FROM issues
WHERE state = 'open'
  AND (sqlc.narg('language')::varchar IS NULL OR language = sqlc.narg('language'))
  AND (sqlc.narg('difficulty')::varchar IS NULL OR difficulty = sqlc.narg('difficulty'))
  AND NOT EXISTS (
    SELECT 1 FROM draws d WHERE d.issue_id = issues.id AND d.user_id = $1
  )
GROUP BY rarity;

-- name: GetRandomIssueByRarityForUser :one
-- Picks a random issue of a specific rarity tier, excluding already-drawn issues.
SELECT * FROM issues
WHERE state = 'open'
  AND rarity = $1
  AND (sqlc.narg('language')::varchar IS NULL OR language = sqlc.narg('language'))
  AND (sqlc.narg('difficulty')::varchar IS NULL OR difficulty = sqlc.narg('difficulty'))
  AND NOT EXISTS (
    SELECT 1 FROM draws d WHERE d.issue_id = issues.id AND d.user_id = $2
  )
OFFSET $3
LIMIT 1;
