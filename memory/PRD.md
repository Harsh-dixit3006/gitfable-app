# GitFable - Product Requirements Document

## Original Problem Statement
GitFable is a gamified web app that matches developers with open-source "good first issues" through a modern, tactile card-draw mechanic. Users set language and difficulty filters, draw an issue from the stack, bookmark it, submit a PR, and earn XP, narrative-themed badges, and leaderboard rankings.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn UI + Framer Motion
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver)
- **Database**: MongoDB
- **Auth**: Mock GitHub auth (JWT-based, username login)
- **Design**: Premium dark product aesthetic (callsine/obvious/vectara-inspired): neutral monochrome surfaces, subtle sky accent, dense bento layouts, cinematic staggered motion, Satoshi-first typography

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
- [x] Reward split mechanics: Draw now awards +10 XP (2x) with 3/day cap
- [x] New direct selection flow: `POST /api/draws/choose` awards +5 XP with no daily cap
- [x] Issues listing endpoint upgraded for selector table (`GET /api/issues` sorted by stars, higher limit)

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
- [x] Full frontend verification pass completed via testing agent (`/app/test_reports/iteration_2.json`)
- [x] Login, draw, bookmark, submit PR, verify merge, dashboard, leaderboard, history, profile navigation validated end-to-end
- [x] Accessibility polish: added explicit dialog descriptions/`aria-describedby` for login and PR dialogs
- [x] Typography refresh: replaced legacy heading/body stack with Satoshi-first font system (user-approved direction)
- [x] Motion polish (Landing + Discover): smoother cinematic easing, staggered hero reveals, softer card transitions, ambient glow/breathe effects
- [x] Frontend regression validation completed for typography + motion polish (landing/discover flows passed)
- [x] Full-app visual redesign pass across Landing, Discover, Dashboard, Leaderboard, History, Profile, and Navbar/login
- [x] New design language implemented: neutral monochrome palette + subtle sky accent + denser bento-style information surfaces
- [x] Added new Landing and Discover signal panels for higher information density and product-style scanning
- [x] Regression testing complete after redesign (`/app/test_reports/iteration_3.json`, frontend pass 100%)
- [x] Discover now supports both modes: **Draw (2x reward)** and **Choose from table**
- [x] Added filterable Issues Table on Discover (search + language/difficulty filter integration)
- [x] Added “Choose” action per issue row to start normal contribution flow (bookmark / PR / verify)
- [x] End-to-end test pass for draw/choose mechanics and UI (`/app/test_reports/iteration_4.json`, frontend+backend pass 100%)

## Prioritized Backlog

### P0 (Critical - Next Phase)
- Real GitHub OAuth integration (replace mock username login)
- Real GitHub API for issue fetching and PR verification
- Daily cron job for issue sync + quality filters

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
