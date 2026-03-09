# GitFable - P2 Implementation Backlog

## Overview
P2 items are the next major features to implement after P0 (critical fixes) and P1 (important improvements) are complete. These features will significantly enhance user engagement and platform value.

---

## P2.1: Email Notifications System

### Purpose
Keep users engaged by sending timely notifications about their activity and preventing loss of progress.

### Features to Implement

#### 1. Email Service Infrastructure
- **Location**: `backend/internal/service/email.go`
- **Provider**: SendGrid (already installed: `github.com/sendgrid/sendgrid-go`)
- **Environment Variables**:
  ```bash
  SENDGRID_API_KEY=your_api_key_here
  EMAIL_FROM_ADDRESS=noreply@gitfable.app
  EMAIL_FROM_NAME=GitFable
  ```

#### 2. Email Templates Needed
Create HTML templates in `backend/internal/service/email_templates/`:

**A. Bookmark Expiry Warning** (`bookmark_expiry.html`)
- Trigger: 24 hours before bookmark expires
- Content:
  - Issue title and repo
  - Time remaining
  - CTA: "View Issue" button
  - CTA: "Abandon Issue" button
  - Unsubscribe link

**B. Streak At Risk** (`streak_risk.html`)
- Trigger: 12 hours before streak breaks
- Content:
  - Current streak count
  - Time remaining to contribute
  - Suggested actions
  - CTA: "Find an Issue" button

**C. Welcome Email** (`welcome.html`)
- Trigger: After first successful login
- Content:
  - Welcome message
  - Quick start guide
  - Link to dashboard

**D. Weekly Digest** (`weekly_digest.html`)
- Trigger: Every Monday 9 AM
- Content:
  - XP earned this week
  - Issues worked on
  - Streak status
  - Leaderboard position
  - Upcoming expiring bookmarks

#### 3. Database Schema Updates
Add to `backend/sql/migrations/`:

```sql
-- Email preferences table
CREATE TABLE email_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bookmark_expiry_enabled BOOLEAN DEFAULT true,
    streak_risk_enabled BOOLEAN DEFAULT true,
    weekly_digest_enabled BOOLEAN DEFAULT true,
    marketing_emails_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Email log table (for tracking)
CREATE TABLE email_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_type VARCHAR(50) NOT NULL,
    subject TEXT NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(20) NOT NULL, -- 'sent', 'failed', 'bounced'
    error_message TEXT
);

-- Indexes
CREATE INDEX idx_email_preferences_user_id ON email_preferences(user_id);
CREATE INDEX idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX idx_email_logs_sent_at ON email_logs(sent_at);
```

#### 4. Scheduled Jobs
Create `backend/internal/jobs/` package:

**A. Bookmark Expiry Check** (`bookmark_expiry_job.go`)
- Schedule: Every hour
- Query: Find bookmarks expiring in 24h that haven't been notified
- Action: Send email, mark as notified

**B. Streak Risk Check** (`streak_risk_job.go`)
- Schedule: Every 6 hours
- Query: Find users with active streaks expiring in 12h
- Action: Send email

**C. Weekly Digest** (`weekly_digest_job.go`)
- Schedule: Every Monday 9 AM
- Query: All users with weekly_digest_enabled=true
- Action: Send digest email

#### 5. Frontend Settings Updates
Add to Settings page (`frontend/src/pages/Settings.js`):

**New Section: Email Preferences**
- Toggle: Bookmark expiry reminders
- Toggle: Streak risk alerts
- Toggle: Weekly digest
- Toggle: Product updates (marketing)
- Note: "You can unsubscribe from any email using the link at the bottom"

#### 6. API Endpoints
Add to `backend/internal/handler/users.go`:

```go
// GET /users/email-preferences - Get current preferences
// PUT /users/email-preferences - Update preferences
```

#### 7. Implementation Steps
1. Create email service package
2. Create HTML email templates
3. Add database migrations
4. Create scheduled jobs
5. Add API endpoints
6. Update frontend Settings page
7. Test with SendGrid sandbox
8. Add to Docker compose for cron jobs

---

## P2.2: Social Features

### Purpose
Build community engagement by allowing users to connect and interact.

### Features to Implement

#### 1. Follow System
**Database Schema**:
```sql
CREATE TABLE follows (
    id BIGSERIAL PRIMARY KEY,
    follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
```

**API Endpoints**:
```go
POST   /users/{id}/follow
DELETE /users/{id}/follow
GET    /users/{id}/followers
GET    /users/{id}/following
GET    /users/me/following/activity  // Activity feed from followed users
```

**Frontend**:
- Follow button on public profiles
- Followers/Following counts on profile
- Following activity feed on Dashboard

#### 2. Comments on Contributions
**Database Schema**:
```sql
CREATE TABLE comments (
    id BIGSERIAL PRIMARY KEY,
    draw_id BIGINT NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_draw ON comments(draw_id);
CREATE INDEX idx_comments_user ON comments(user_id);
```

**Features**:
- Comment on merged PRs
- Comment on public profiles
- Markdown support
- Email notifications for replies

#### 3. Activity Feed Improvements
- Filter by "Following" vs "Global"
- Real-time updates via WebSocket
- Like/reactions on activities

---

## P2.3: Mobile App

### Purpose
Provide native mobile experience for better engagement.

### Options

#### Option A: Capacitor (Recommended)
- **Pros**: Use existing React codebase, single codebase, faster development
- **Cons**: Not truly native, some performance limitations
- **Implementation**:
  1. Add `@capacitor/core` and platform packages
  2. Create `capacitor.config.json`
  3. Add mobile-specific optimizations
  4. Build iOS/Android projects
  5. Publish to App Store/Play Store

#### Option B: React Native
- **Pros**: Native performance, better UX
- **Cons**: Separate codebase, more maintenance
- **Decision**: Only if Capacitor performance is insufficient

### Mobile Features
- Push notifications (Firebase Cloud Messaging)
- Offline mode (PWA + local storage)
- Native share sheets
- Camera integration (for avatar upload)
- Biometric authentication

---

## P2.4: Analytics Dashboard

### Purpose
Internal dashboard for platform monitoring and insights.

### Features

#### 1. Metrics to Track
**User Metrics**:
- DAU/MAU (Daily/Monthly Active Users)
- User retention (Day 1, Day 7, Day 30)
- Sign-up conversion rate
- Level distribution

**Engagement Metrics**:
- Draws per user per day
- Bookmark to PR conversion rate
- PR to merge conversion rate
- Average time to merge
- Streak distribution

**Issue Metrics**:
- Most drawn issues
- Most merged issues
- Issues by language distribution
- Issues by difficulty distribution
- Time from draw to bookmark
- Time from bookmark to PR

**Performance Metrics**:
- API response times
- Error rates
- Database query performance

#### 2. Database Schema
```sql
-- Analytics events table
CREATE TABLE analytics_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_created_at ON analytics_events(created_at);
CREATE INDEX idx_analytics_user_id ON analytics_events(user_id);

-- Daily aggregates
CREATE TABLE analytics_daily (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    dau INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    total_draws INTEGER DEFAULT 0,
    total_merges INTEGER DEFAULT 0,
    avg_time_to_merge INTEGER, -- in hours
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3. Dashboard UI
Create `frontend/src/pages/AdminDashboard.js` (protected route):
- Time range selector (Last 7 days, 30 days, 90 days)
- Charts using Recharts or Chart.js
- Key metrics cards
- Export to CSV functionality

#### 4. Tracking Implementation
Add event tracking throughout the app:
- User sign up
- Issue drawn
- Bookmark created
- PR submitted
- PR merged
- Level up
- Badge earned

---

## Implementation Priority Within P2

1. **Start with P2.1 (Email Notifications)**
   - Highest user impact
   - Prevents user churn
   - Relatively straightforward

2. **Then P2.4 (Analytics)**
   - Needed to measure impact of other features
   - Helps make data-driven decisions

3. **Then P2.2 (Social Features)**
   - Build community
   - Increase engagement

4. **Finally P2.3 (Mobile App)**
   - Most complex
   - Do after platform is proven

---

## Technical Considerations

### Email Notifications
- Use SendGrid's template system for easier management
- Implement rate limiting to prevent spam
- Track email opens and clicks
- Honor unsubscribe requests immediately
- GDPR compliance for EU users

### Social Features
- Pagination for followers/following lists
- Cache follower counts
- Prevent abuse (rate limiting on follows)
- Moderation system for comments

### Mobile App
- Deep linking support
- Offline-first architecture
- Push notification permissions
- App store optimization (ASO)

### Analytics
- Aggregate data daily to prevent performance issues
- Use materialized views for common queries
- Data retention policy (e.g., keep raw events 90 days)
- Anonymize user data for privacy

---

## Success Metrics

After implementing P2 features:
- **Email**: >30% open rate on bookmark expiry emails
- **Social**: >10% of users follow at least one other user
- **Mobile**: >20% of traffic from mobile app
- **Analytics**: All key metrics visible and actionable

---

## Notes

- All P2 features require careful testing before production
- Consider feature flags for gradual rollout
- Monitor performance impact on database
- Document APIs for future integrations