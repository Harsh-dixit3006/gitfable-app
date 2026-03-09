-- name: GetUserByFirebaseUID :one
SELECT * FROM users WHERE firebase_uid = $1;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE LOWER(username) = LOWER($1);

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByPublicID :one
SELECT * FROM users WHERE public_id = $1;

-- name: CreateUser :one
INSERT INTO users (firebase_uid, username, email, display_name, avatar_url, github_id, github_username)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdateUserProfile :one
UPDATE users SET display_name = $2, avatar_url = $3 WHERE id = $1 RETURNING *;

-- name: UpdateUserFilters :one
UPDATE users SET filters = $2 WHERE id = $1 RETURNING *;

-- name: UpdateUserDailyDrawLimitByUsername :one
UPDATE users SET daily_draw_limit = $2 WHERE LOWER(username) = LOWER($1) RETURNING *;

-- name: UpdateUserXP :one
UPDATE users SET xp = $2, level = $3 WHERE id = $1 RETURNING *;

-- name: UpdateUserStreak :exec
UPDATE users SET current_streak = $2, longest_streak = $3, last_contribution_date = $4 WHERE id = $1;

-- name: IncrementContributions :exec
UPDATE users SET total_contributions = total_contributions + 1 WHERE id = $1;

-- name: GetLeaderboard :many
SELECT id, public_id, username, display_name, avatar_url, xp, level, total_contributions
FROM users
WHERE status = 'active'
ORDER BY xp DESC, id DESC
LIMIT $1;

-- name: GetLeaderboardAfterCursor :many
SELECT id, public_id, username, display_name, avatar_url, xp, level, total_contributions
FROM users
WHERE status = 'active' AND (xp < $1 OR (xp = $1 AND id < sqlc.arg('cursor_id')::bigint))
ORDER BY xp DESC, id DESC
LIMIT $2;

-- name: CountActiveUsers :one
SELECT COUNT(*) FROM users WHERE status = 'active';

-- name: SyncUserFromFirebase :one
UPDATE users SET email = $2, display_name = $3, avatar_url = $4 WHERE firebase_uid = $1 RETURNING *;

-- name: DeleteUserByGithubUsername :exec
DELETE FROM users WHERE github_username = $1;

-- name: GetUserByGithubUsername :one
SELECT * FROM users WHERE github_username = $1;

-- Supabase Auth Queries (replaces Firebase)
-- name: GetUserByAuthID :one
SELECT * FROM users WHERE auth_id = $1;

-- name: CreateUserWithAuthID :one
INSERT INTO users (auth_id, firebase_uid, username, email, display_name, avatar_url, github_id, github_username)
VALUES ($1, $1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdateUserAuthProfile :one
UPDATE users SET email = $2, display_name = $3, avatar_url = $4 WHERE auth_id = $1 RETURNING *;
