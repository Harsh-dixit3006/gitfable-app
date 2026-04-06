# GitFable — Promotional Posts

## 1. Hacker News / lobste.rs — Technical Show HN

**Title:** Show HN: GitFable – Card-based discovery for open-source contributions

**Body:**

I built GitFable to solve a problem I had: finding good first issues on GitHub felt like scrolling through a job board. Everything looked the same, nothing felt exciting.

So I wrapped it in a card-draw mechanic. You draw random issues with rarity tiers (common through legendary), bookmark up to 5 as "active quests," submit PRs, and earn XP and streaks. The gamification isn't decoration — the rarity weighting surfaces issues by difficulty and repo quality, and the quest log enforces focus (you can't hoard 50 bookmarks).

The draw probabilities are weighted (40% common, 30% rare, 20% epic, 10% legendary) so you occasionally get that legendary pull — a high-star repo with a clean issue and clear contributing guidelines.

Still early, but live and usable. Would love feedback on the workflow and whether the gamification actually helps or just gets in the way.

---

## 2. Reddit — r/programming, r/opensource, r/sideproject

**Title:** I turned finding open-source issues into a card game because scrolling GitHub issues was killing my motivation

**Body:**

We've all been there — you want to contribute to open source, you go to GitHub, search "good first issue," and get 500 results. Half are stale. A quarter are in repos nobody's heard of. The rest all blur together.

GitFable flips this. Instead of browsing, you draw cards. Each card is a real GitHub issue with a rarity tier based on the repo's stars, activity, and issue quality. You get a daily draw budget, bookmark up to 5 issues as active quests, and earn XP when your PRs get merged.

It's not about the points — it's about making the first step feel less like homework and more like opening a pack of cards.

Built with Go + PostgreSQL + React. Still early days.

[screenshot of draw animation if you have one]

---

## 3. Twitter/X — Short & punchy

### Option A (product)

open source contribution shouldn't feel like homework

built GitFable — draw issue cards with rarity tiers, bookmark quests, submit PRs, earn XP

common issues are quick wins, legendary pulls are high-star repos with clean contributor guides

the gamification isn't decoration. it enforces focus (5 active quests max) and surfaces quality issues through weighted probability

[gif of card draw]

### Option B (personal story thread)

i wanted to contribute to open source

i searched "good first issue" on github

i got 500 results and closed the tab

so i built a card game instead

[1/4 thread continues with screenshots]

### Option C (dev audience)

gitfable tech stack because someone will ask:

- go backend, chi router, sqlc
- postgres with UUID public IDs (never leak internal IDs)
- self-hosted github oauth + JWT (no firebase/supabase dependency)
- react 19 + shadcn + tailwind
- idempotent merge rewards (webhook + manual verify both use one function)
- deployed to VPS via github actions + tailscale SSH

[link]

---

## 4. Dev.to / Hashnode — Blog post

**Title:** I Built a Card Game for Open-Source Contributions (And It Actually Works)

**Outline:**

1. **The problem** — why "good first issue" is broken for newcomers
2. **The idea** — trading card game meets developer tool
3. **How the rarity system works** — weighted probability, what makes an issue "legendary"
4. **The quest log** — why limiting to 5 active bookmarks improves completion rates
5. **The tech** — Go, PostgreSQL, sqlc, React (brief, for the dev audience)
6. **What I learned** — gamification that enforces behavior vs. gamification that decorates
7. **Try it** — link and call to action

---

## 5. LinkedIn — Professional angle

Open-source contribution has an onboarding problem.

Most developers want to contribute but get stuck at step one: finding the right issue. GitHub's "good first issue" label returns thousands of results with no way to prioritize them.

I built GitFable to make that first step intentional instead of overwhelming. It uses a card-draw mechanic with rarity tiers to surface quality issues, a quest log to enforce focus, and XP-based progression to reward follow-through.

The goal isn't to gamify for the sake of it — it's to solve a real UX problem in the open-source ecosystem.

Built with Go and React. Link in comments.

---

## 6. Discord / Slack communities (dev-focused)

hey — i built something for anyone who's wanted to contribute to OSS but gets stuck finding issues

**GitFable** — you draw random github issues as cards with rarity tiers (common/rare/epic/legendary), bookmark up to 5 as quests, and earn XP when your PRs merge

it's like a gacha game but for actual open-source contributions. daily draws, streak tracking, the whole thing

it's live — would love feedback from people who've struggled with the same thing

[link]

---

## 7. daily.dev — Blog post

**Body:**

Open-source contribution has an onboarding problem.

**Body:**

Open-source contribution has an onboarding problem.

I wanted to contribute. I really did. I opened GitHub, searched "good first issue," and got 500 results. Half were stale. A quarter were in repos nobody's heard of. The rest blurred together into an undifferentiated wall of text. I closed the tab and went back to my day job.

This happened more than once. The intent was always there, but the experience of getting started was actively demotivating.

### The problem isn't the issue quality — it's the presentation

The issues are there. Thousands of them. Good ones, too. But the interface for finding them is a flat list with no sense of priority, no sense of excitement, and no sense of progress. It's a job board for free work.

I kept thinking: this is a solved problem in other domains. Dating apps don't show you 500 matches. Game stores don't show you 500 games. They curate. They surface. They make the first choice feel meaningful.

What if finding an open-source issue felt like that?

### The idea: card-based discovery

I built GitFable. Instead of browsing issues, you draw them. Each draw reveals a real GitHub issue with a rarity tier — common, rare, epic, or legendary. The rarity is weighted by the repo's star count, recent activity, and issue quality. 40% common, 30% rare, 20% epic, 10% legendary.

When you draw an issue and it looks interesting, you bookmark it it into a quest log. The quest log holds up to 5 active issues at a time. This isn't arbitrary — it's designed to enforce focus. The #1 reason people don't follow through on "good first issues" is they bookmark 20 and forget about all of them. Five is enough to be engaged, few enough to actually complete.

When your PR gets merged, you earn XP. There's a streak system. There are badges. The usual gamification loop. But here's the thing I want to be honest about — the gamification isn't the point. The point is that the moment of — opening a card, seeing the rarity reveal, feeling a small surge of excitement — is *what gets you to to actually start the contributink. The rest is retention.

### The technical decisions

A few things I deliberately chose:

**Go + sqlc + PostgreSQL** — sqlc generates type-safe Go code from raw SQL queries. No ORM, no abstraction leaks. You write SQL, you get typesafe functions. The schema is the source of truth. Internal BIGSERIAL primary keys with UUID public IDs exposed in the API — never leak internal IDs. 5 migrations, each backward-compatible.

**Self-hosted GitHub OAuth + JWT** — No Firebase, no Supabase, no third-party auth dependency. The backend handles the full OAuth flow directly, issues its own HS256 JWTs. Registration tokens for new users, access/refresh tokens for returning users. If the auth service goes down, it's my problem, not a vendor's.

**Idempotent merge rewards** — This was a real design challenge. PR merges can be detected two ways: the user manually hits "verify," or a GitHub webhook fires. Both paths need to award the same XP, increment the same streak, check the same badges — exactly once. I centralized this into a single `CompleteMerge` function with a `reward_processed_at` guard. The second caller gets a clean "already merged" response, no duplicate rewards.

**React 19 + Shadcn/Radix + Tailwind** — Standard frontend stack. No fancy state management, just React Context for auth and local state per page. The draw animation uses Framer Motion — slowed it down significantly from my first version because the reveal was too fast to feel satisfying.

**Deployed to a single VPS** — GitHub Actions builds Docker images, pushes to GHCR, deploys via Tailscale SSH. Caddy handles TLS. Not serverless, not Kubernetes. One machine, one compose file. Simple enough for the current scale.

### What I learned

**Gamification that enforces behavior > gamification that decorates.** A 5-slot quest limit changes how people engage. A daily draw budget creates scarcity. Rarity tiers create genuine surprise. These aren't bolted-on badges — they're structural to how the app works. If you're going to gamify something, make the game mechanics *be* the product, not a layer on top of it.

**The best onboarding is the one people actually start.** Every design decision in GitFable optimizes for the first 30 seconds. Can you find an issue in 30 seconds? Yes — draw a card. Can you understand what to do next? Yes — it's bookmarked in your quest log with a clear next step. Can you see progress? Yes — XP, levels, streaks.

**Build what scratches your own itch.** I built this because *I* couldn't get started with open source. Every feature exists because it solved a specific friction point in my own workflow. That's a better filter for feature requests than "wouldn't it be cool if..."

### Try it

GitFable is live. The issue pool is seeded from real GitHub repos with "good first issue" labels. If you've been meaning to contribute to open source but keep closing the tab, give it a try.

[link to repo / live app]

---

## Key Visual Assets

For any of these posts, the highest-impact assets would be:

1. **GIF of the card draw animation** — this is your signature moment
2. **Screenshot of the quest log / active work panel** — shows the 5-slot mechanic
3. **Before/after comparison** — GitHub issues search vs. GitFable draw
