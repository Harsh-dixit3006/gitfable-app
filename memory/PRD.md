# GitFable - Product Requirements Document

## Original Problem Statement
GitFable is a gamified web app that matches developers with open-source "good first issues" through a modern, tactile card-draw mechanic. Users set language and difficulty filters, draw an issue from the stack, bookmark it, submit a PR, and earn XP, narrative-themed badges, and leaderboard rankings.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn UI + Framer Motion
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver)
- **Database**: MongoDB
- **Auth**: Mock GitHub auth (JWT-based, username login)
- **Design**: Dark theme, Vercel/Linear aesthetic, Playfair Display + Inter fonts, gold (#F59E0B) accent

## User Personas
1. **Beginner Developer**: Making their first open-source contribution, needs guided issues
2. **Experienced Developer**: Exploring new projects, motivated by gamification and streaks

## Core Requirements
- Card-draw mechanic for discovering open-source issues
- Language and difficulty filtering
- Bookmark system with 7-day timer
- XP/Level progression (500 XP per level)
- 10 narrative-themed badges
- Streak tracking (48h forgiving window)
- Leaderboard with period tabs and podium
- Draw history with status tracking
- Public shareable profiles

## What's Been Implemented (March 4, 2026)
### Backend
- [x] Mock GitHub auth with JWT tokens
- [x] User creation and management
- [x] Cached issues (28 mock open-source issues across 10+ languages)
- [x] Draw mechanic with filter support and daily limit (3/day)
- [x] Bookmark system with 7-day expiry
- [x] PR submission and mock verification
- [x] XP/Level calculation and awards
- [x] 10 badge conditions and auto-checking
- [x] Streak tracking
- [x] Leaderboard with ranked queries
- [x] Public profile endpoint
- [x] Activity feed and global stats
- [x] Auto-seeding mock data on startup

### Frontend
- [x] Landing page with hero, How It Works, live stats, activity feed
- [x] Discover page with filter chips and card draw animation (framer-motion)
- [x] Dashboard with profile card, stats grid, badge grid, contribution heatmap, recent draws
- [x] Leaderboard with period tabs, top-3 podium, ranked table
- [x] History page with status filters and chronological ledger
- [x] Public profile page (/u/:username)
- [x] Dark theme with gold accent, Playfair Display serif headings
- [x] Responsive design, glassmorphism cards
- [x] Data-testid attributes on all interactive elements

## Prioritized Backlog

### P0 (Critical - Next Phase)
- Real GitHub OAuth integration (requires Client ID/Secret)
- Real GitHub API for issue fetching and PR verification
- Daily cron job for issue sync

### P1 (Important)
- OG meta tags for social sharing on public profiles
- Share cards ("I just merged a chapter in [repo]!")
- Sound effects toggle for card draw
- Weekly leaderboard resets

### P2 (Nice to Have)
- Email notifications for streak risk
- Confetti/sparks on first draw of the day
- Issue quality scoring
- Advanced search and sorting in history
- Mobile app wrapper
