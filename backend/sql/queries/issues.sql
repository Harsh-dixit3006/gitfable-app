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
SELECT * FROM issues
WHERE state = 'open'
  AND (sqlc.narg('language')::varchar IS NULL OR language = sqlc.narg('language'))
  AND (sqlc.narg('difficulty')::varchar IS NULL OR difficulty = sqlc.narg('difficulty'))
ORDER BY repo_stars DESC
LIMIT $1;

-- name: ListIssuesAfterCursor :many
SELECT * FROM issues
WHERE state = 'open'
  AND (sqlc.narg('language')::varchar IS NULL OR language = sqlc.narg('language'))
  AND (sqlc.narg('difficulty')::varchar IS NULL OR difficulty = sqlc.narg('difficulty'))
  AND (repo_stars < $1 OR (repo_stars = $1 AND id < sqlc.arg('cursor_id')::bigint))
ORDER BY repo_stars DESC, id DESC
LIMIT $2;

-- name: CountDistinctRepos :one
SELECT COUNT(DISTINCT (repo_owner, repo_name)) FROM issues WHERE state = 'open';

-- name: CreateIssue :one
INSERT INTO issues (github_id, repo_owner, repo_name, title, url, language, difficulty, repo_stars, labels, state)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: CountIssues :one
SELECT COUNT(*) FROM issues;
