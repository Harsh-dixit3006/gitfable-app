-- name: GetBadgeByName :one
SELECT * FROM badges WHERE name = $1;

-- name: CreateBadge :one
INSERT INTO badges (name, description, icon) VALUES ($1, $2, $3)
ON CONFLICT (name) DO NOTHING
RETURNING *;

-- name: UpsertBadge :exec
INSERT INTO badges (name, description, icon) VALUES ($1, $2, $3)
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, icon = EXCLUDED.icon;

-- name: AwardBadge :one
INSERT INTO user_badges (user_id, badge_id, draw_id, earned_at)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (user_id, badge_id) DO NOTHING
RETURNING *;

-- name: GetUserBadges :many
SELECT ub.earned_at, b.name, b.description, b.icon
FROM user_badges ub
JOIN badges b ON ub.badge_id = b.id
WHERE ub.user_id = $1
ORDER BY ub.earned_at DESC;

-- name: GetUserBadgeNames :many
SELECT b.name FROM user_badges ub JOIN badges b ON ub.badge_id = b.id WHERE ub.user_id = $1;

-- name: ListBadges :many
SELECT * FROM badges ORDER BY id;
