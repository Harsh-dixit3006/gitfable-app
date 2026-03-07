-- Enums
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE draw_status AS ENUM ('drawn', 'bookmarked', 'expired', 'pr_submitted', 'merged', 'abandoned');
CREATE TYPE issue_state AS ENUM ('open', 'closed', 'stale');
CREATE TYPE activity_action AS ENUM ('merged', 'badge_earned', 'streak_milestone');

-- Users
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    firebase_uid VARCHAR(128) NOT NULL UNIQUE,
    username VARCHAR(39) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    github_id VARCHAR(64) UNIQUE,
    github_username VARCHAR(39) UNIQUE,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    current_streak INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    last_contribution_date TIMESTAMPTZ,
    total_contributions INTEGER NOT NULL DEFAULT 0,
    filters JSONB NOT NULL DEFAULT '{}',
    status user_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_username ON users(LOWER(username));
CREATE INDEX idx_users_xp ON users(xp DESC);

-- Issues
CREATE TABLE issues (
    id BIGSERIAL PRIMARY KEY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    github_id BIGINT NOT NULL UNIQUE,
    github_number INTEGER NOT NULL DEFAULT 0,
    repo_owner VARCHAR(255) NOT NULL,
    repo_name VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    language VARCHAR(50),
    difficulty VARCHAR(20),
    repo_stars INTEGER NOT NULL DEFAULT 0,
    repo_pushed_at TIMESTAMPTZ,
    github_created_at TIMESTAMPTZ,
    labels TEXT[] NOT NULL DEFAULT '{}',
    state issue_state NOT NULL DEFAULT 'open',
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_issues_language ON issues(language);
CREATE INDEX idx_issues_difficulty ON issues(difficulty);
CREATE INDEX idx_issues_state ON issues(state);
CREATE INDEX idx_issues_repo ON issues(repo_owner, repo_name);
CREATE INDEX idx_issues_stars ON issues(repo_stars DESC);

-- Draws
CREATE TABLE draws (
    id BIGSERIAL PRIMARY KEY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    user_id BIGINT NOT NULL REFERENCES users(id),
    issue_id BIGINT NOT NULL REFERENCES issues(id),
    status draw_status NOT NULL DEFAULT 'drawn',
    source VARCHAR(20) NOT NULL DEFAULT 'draw',
    pr_url TEXT,
    pr_submitted_at TIMESTAMPTZ,
    merge_commit_sha VARCHAR(255),
    merged_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    xp_awarded INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_draws_user_id ON draws(user_id);
CREATE INDEX idx_draws_issue_id ON draws(issue_id);
CREATE INDEX idx_draws_status ON draws(status);
CREATE INDEX idx_draws_user_status ON draws(user_id, status);
CREATE INDEX idx_draws_user_created ON draws(user_id, created_at DESC);
CREATE INDEX idx_draws_merged_at ON draws(merged_at DESC) WHERE merged_at IS NOT NULL;
CREATE INDEX idx_draws_pr_url ON draws(pr_url) WHERE pr_url IS NOT NULL;
CREATE INDEX idx_draws_user_issue ON draws(user_id, issue_id);

-- Badges
CREATE TABLE badges (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    icon VARCHAR(50) NOT NULL DEFAULT ''
);

-- User Badges
CREATE TABLE user_badges (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    badge_id BIGINT NOT NULL REFERENCES badges(id),
    draw_id BIGINT REFERENCES draws(id),
    earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, badge_id)
);

CREATE INDEX idx_user_badges_user ON user_badges(user_id);

-- Activities
CREATE TABLE activities (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    draw_id BIGINT REFERENCES draws(id),
    action activity_action NOT NULL,
    repo_owner VARCHAR(255),
    repo_name VARCHAR(255),
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_user_time ON activities(user_id, created_at DESC);
CREATE INDEX idx_activities_created ON activities(created_at DESC);

-- Events (audit log)
CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_user_time ON events(user_id, created_at DESC);
CREATE INDEX idx_events_type ON events(event_type);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_issues_updated_at BEFORE UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_draws_updated_at BEFORE UPDATE ON draws FOR EACH ROW EXECUTE FUNCTION update_updated_at();
