-- name: CreateEvent :exec
INSERT INTO events (user_id, event_type, payload) VALUES ($1, $2, $3);

-- name: GetUserEvents :many
SELECT * FROM events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2;
