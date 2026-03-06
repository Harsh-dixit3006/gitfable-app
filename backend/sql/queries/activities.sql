-- name: CreateActivity :one
INSERT INTO activities (user_id, draw_id, action, repo_owner, repo_name, title)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListRecentActivities :many
SELECT a.*, u.username, u.avatar_url, u.public_id AS user_public_id
FROM activities a
JOIN users u ON a.user_id = u.id
ORDER BY a.created_at DESC
LIMIT $1;

-- name: ListRecentActivitiesAfterCursor :many
SELECT a.*, u.username, u.avatar_url, u.public_id AS user_public_id
FROM activities a
JOIN users u ON a.user_id = u.id
WHERE (a.created_at, a.id) < ($1, $2)
ORDER BY a.created_at DESC, a.id DESC
LIMIT $3;
