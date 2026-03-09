-- name: CreateActivity :one
INSERT INTO activities (user_id, draw_id, action, repo_owner, repo_name, title)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListRecentActivities :many
SELECT a.*, u.username, u.avatar_url, u.public_id AS user_public_id
FROM activities a
JOIN users u ON a.user_id = u.id
ORDER BY a.created_at DESC, a.id DESC
LIMIT $1;

-- name: ListRecentActivitiesAfterCursor :many
SELECT a.*, u.username, u.avatar_url, u.public_id AS user_public_id
FROM activities a
JOIN users u ON a.user_id = u.id
WHERE (a.created_at < $1 OR (a.created_at = $1 AND a.id < sqlc.arg('cursor_id')::bigint))
ORDER BY a.created_at DESC, a.id DESC
LIMIT $2;

-- name: DeleteActivitiesByUserID :exec
DELETE FROM activities WHERE user_id = $1;
