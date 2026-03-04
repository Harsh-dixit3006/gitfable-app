from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import random

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

JWT_SECRET = os.environ.get('JWT_SECRET', 'gitfable-secret-2026')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# --- Models ---
class LoginRequest(BaseModel):
    username: str

class DrawRequest(BaseModel):
    languages: List[str] = []
    difficulties: List[str] = []

class ChooseIssueRequest(BaseModel):
    issue_id: str

class SubmitPRRequest(BaseModel):
    pr_url: str

class FilterUpdate(BaseModel):
    languages: List[str] = []
    difficulties: List[str] = []


# --- Auth ---
def create_token(user_id: str):
    return jwt.encode(
        {'user_id': user_id, 'exp': datetime.now(timezone.utc) + timedelta(days=30)},
        JWT_SECRET, algorithm='HS256'
    )

async def get_current_user(authorization: str):
    try:
        token = authorization.replace('Bearer ', '')
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        user = await db.users.find_one({'id': payload['user_id']}, {'_id': 0})
        if not user:
            raise HTTPException(status_code=401, detail='User not found')
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')

async def auth_user(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail='Authorization required')
    return await get_current_user(authorization)


# --- Helpers ---
def calc_level(xp):
    return (xp // 500) + 1

async def award_xp(user_id, amount):
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user:
        return 0, 1
    new_xp = user.get('xp', 0) + amount
    new_level = calc_level(new_xp)
    await db.users.update_one({'id': user_id}, {'$set': {'xp': new_xp, 'level': new_level}})
    return new_xp, new_level

def build_draw_record(user_id: str, issue: dict, source: str):
    return {
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'issue_id': issue.get('id', ''),
        'repo': issue.get('repo', ''),
        'title': issue.get('title', ''),
        'url': issue.get('url', ''),
        'language': issue.get('language', ''),
        'difficulty': issue.get('difficulty', ''),
        'stars': issue.get('stars', 0),
        'labels': issue.get('labels', []),
        'status': 'drawn',
        'source': source,
        'pr_url': None,
        'drawn_at': datetime.now(timezone.utc).isoformat(),
        'bookmarked_at': None,
        'pr_submitted_at': None,
        'merged_at': None,
        'expired_at': None,
    }

def get_draws_remaining(user: dict):
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    if user.get('last_redraw_date') != today:
        return 3
    return max(0, 3 - user.get('redraws_today', 0))

BADGES_META = [
    {'name': 'Prologue', 'description': 'First merged PR', 'icon': 'book-open'},
    {'name': 'Short Story', 'description': '3 PRs merged', 'icon': 'files'},
    {'name': 'The Epic', 'description': '100 PRs merged', 'icon': 'library'},
    {'name': 'Anthology', 'description': 'PRs in 5+ languages', 'icon': 'book-copy'},
    {'name': 'Midnight Draft', 'description': 'PR merged midnight-5am', 'icon': 'moon-star'},
    {'name': 'Fast Forward', 'description': 'PR merged within 24h', 'icon': 'fast-forward'},
    {'name': 'Daily Author', 'description': '30-day streak', 'icon': 'pen-tool'},
    {'name': 'Worldbuilder', 'description': '10+ different repos', 'icon': 'globe'},
    {'name': 'Proofreader', 'description': '10 bug PRs merged', 'icon': 'search'},
    {'name': 'The Archivist', 'description': '10 docs PRs merged', 'icon': 'bookmark'},
]

async def check_badges(user_id):
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user:
        return []
    earned = {b['name'] for b in user.get('badges', [])}
    merged = await db.draws.find({'user_id': user_id, 'status': 'merged'}, {'_id': 0}).to_list(1000)
    count = len(merged)
    new_badges = []
    now = datetime.now(timezone.utc).isoformat()

    if 'Prologue' not in earned and count >= 1:
        new_badges.append({'name': 'Prologue', 'earned_at': now})
    if 'Short Story' not in earned and count >= 3:
        new_badges.append({'name': 'Short Story', 'earned_at': now})
    if 'The Epic' not in earned and count >= 100:
        new_badges.append({'name': 'The Epic', 'earned_at': now})
    if 'Anthology' not in earned and len({d.get('language', '') for d in merged}) >= 5:
        new_badges.append({'name': 'Anthology', 'earned_at': now})
    if 'Midnight Draft' not in earned:
        for d in merged:
            try:
                if datetime.fromisoformat(d.get('merged_at', '')).hour < 5:
                    new_badges.append({'name': 'Midnight Draft', 'earned_at': now})
                    break
            except Exception:
                pass
    if 'Fast Forward' not in earned:
        for d in merged:
            try:
                diff = (datetime.fromisoformat(d['merged_at']) - datetime.fromisoformat(d['drawn_at'])).total_seconds()
                if diff < 86400:
                    new_badges.append({'name': 'Fast Forward', 'earned_at': now})
                    break
            except Exception:
                pass
    if 'Daily Author' not in earned and user.get('longest_streak', 0) >= 30:
        new_badges.append({'name': 'Daily Author', 'earned_at': now})
    if 'Worldbuilder' not in earned and len({d.get('repo', '') for d in merged}) >= 10:
        new_badges.append({'name': 'Worldbuilder', 'earned_at': now})
    if 'Proofreader' not in earned:
        if sum(1 for d in merged if any('bug' in label.lower() for label in d.get('labels', []))) >= 10:
            new_badges.append({'name': 'Proofreader', 'earned_at': now})
    if 'The Archivist' not in earned:
        if sum(1 for d in merged if any('doc' in label.lower() for label in d.get('labels', []))) >= 10:
            new_badges.append({'name': 'The Archivist', 'earned_at': now})

    if new_badges:
        await db.users.update_one({'id': user_id}, {'$push': {'badges': {'$each': new_badges}}})
    return new_badges

async def update_streak(user_id):
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user:
        return
    now = datetime.now(timezone.utc)
    last = user.get('last_contribution_date')
    streak = user.get('current_streak', 0)
    longest = user.get('longest_streak', 0)
    if last:
        try:
            hours = (now - datetime.fromisoformat(last)).total_seconds() / 3600
            if hours < 24:
                pass
            elif hours < 48:
                streak += 1
            else:
                streak = 1
        except Exception:
            streak = 1
    else:
        streak = 1
    longest = max(longest, streak)
    await db.users.update_one({'id': user_id}, {'$set': {
        'current_streak': streak, 'longest_streak': longest,
        'last_contribution_date': now.isoformat()
    }})


# --- Auth Endpoints ---
@api_router.post("/auth/login")
async def login(req: LoginRequest):
    username = req.username.strip().lower().replace(' ', '-')
    if not username or len(username) < 2:
        raise HTTPException(status_code=400, detail="Username must be at least 2 characters")
    user = await db.users.find_one({'username': username}, {'_id': 0})
    if not user:
        user = {
            'id': str(uuid.uuid4()),
            'github_id': random.randint(10000, 99999),
            'username': username,
            'display_name': username.replace('-', ' ').title(),
            'avatar_url': f'https://api.dicebear.com/7.x/identicon/svg?seed={username}',
            'xp': 0, 'level': 1,
            'current_streak': 0, 'longest_streak': 0,
            'last_contribution_date': None,
            'total_contributions': 0,
            'badges': [],
            'filters': {'languages': [], 'difficulties': []},
            'active_bookmark': None,
            'joined_at': datetime.now(timezone.utc).isoformat(),
            'redraws_today': 0, 'last_redraw_date': None,
        }
        await db.users.insert_one({**user})
    return {'token': create_token(user['id']), 'user': user}

@api_router.get("/auth/me")
async def get_me(user=Depends(auth_user)):
    return user


# --- Issues ---
@api_router.get("/issues")
async def get_issues(language: Optional[str] = None, difficulty: Optional[str] = None):
    query = {}
    if language:
        query['language'] = language
    if difficulty:
        query['difficulty'] = difficulty
    return await db.cached_issues.find(query, {'_id': 0}).sort('stars', -1).limit(200).to_list(200)


# --- Draws ---
@api_router.post("/draws/draw")
async def draw_issue(req: DrawRequest, user=Depends(auth_user)):
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    if user.get('last_redraw_date') == today and user.get('redraws_today', 0) >= 3:
        raise HTTPException(status_code=429, detail="Max 3 draws per day reached. Come back tomorrow!")
    query = {}
    if req.languages:
        query['language'] = {'$in': req.languages}
    if req.difficulties:
        query['difficulty'] = {'$in': req.difficulties}
    issues = await db.cached_issues.aggregate([{'$match': query}, {'$sample': {'size': 1}}]).to_list(1)
    if not issues:
        raise HTTPException(status_code=404, detail="No issues found matching your filters")
    issue = issues[0]
    issue.pop('_id', None)
    draw = build_draw_record(user['id'], issue, 'draw')
    await db.draws.insert_one({**draw})
    if user.get('last_redraw_date') != today:
        await db.users.update_one({'id': user['id']}, {'$set': {'redraws_today': 1, 'last_redraw_date': today}})
    else:
        await db.users.update_one({'id': user['id']}, {'$inc': {'redraws_today': 1}})
    await award_xp(user['id'], 10)
    updated = await db.users.find_one({'id': user['id']}, {'_id': 0})
    draw['redraws_remaining'] = get_draws_remaining(updated)
    draw['xp_awarded'] = 10
    return draw

@api_router.post("/draws/choose")
async def choose_issue(req: ChooseIssueRequest, user=Depends(auth_user)):
    issue = await db.cached_issues.find_one({'id': req.issue_id}, {'_id': 0})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    draw = build_draw_record(user['id'], issue, 'choose')
    await db.draws.insert_one({**draw})
    await award_xp(user['id'], 5)
    fresh_user = await db.users.find_one({'id': user['id']}, {'_id': 0})
    draw['redraws_remaining'] = get_draws_remaining(fresh_user)
    draw['xp_awarded'] = 5
    return draw

@api_router.post("/draws/{draw_id}/bookmark")
async def bookmark_draw(draw_id: str, user=Depends(auth_user)):
    draw = await db.draws.find_one({'id': draw_id, 'user_id': user['id']}, {'_id': 0})
    if not draw:
        raise HTTPException(status_code=404, detail="Draw not found")
    if draw['status'] != 'drawn':
        raise HTTPException(status_code=400, detail="Can only bookmark drawn issues")
    if user.get('active_bookmark'):
        raise HTTPException(status_code=400, detail="Release current bookmark first")
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(days=7)).isoformat()
    await db.draws.update_one({'id': draw_id}, {'$set': {'status': 'bookmarked', 'bookmarked_at': now.isoformat()}})
    await db.users.update_one({'id': user['id']}, {'$set': {'active_bookmark': {'draw_id': draw_id, 'expires_at': expires}}})
    await award_xp(user['id'], 10)
    draw['status'] = 'bookmarked'
    draw['bookmarked_at'] = now.isoformat()
    return draw

@api_router.post("/draws/{draw_id}/release")
async def release_bookmark(draw_id: str, user=Depends(auth_user)):
    await db.draws.update_one({'id': draw_id, 'user_id': user['id']}, {'$set': {'status': 'expired', 'expired_at': datetime.now(timezone.utc).isoformat()}})
    await db.users.update_one({'id': user['id']}, {'$set': {'active_bookmark': None}})
    return {"message": "Bookmark released"}

@api_router.post("/draws/{draw_id}/submit-pr")
async def submit_pr(draw_id: str, req: SubmitPRRequest, user=Depends(auth_user)):
    draw = await db.draws.find_one({'id': draw_id, 'user_id': user['id']}, {'_id': 0})
    if not draw:
        raise HTTPException(status_code=404, detail="Draw not found")
    if draw['status'] not in ('drawn', 'bookmarked'):
        raise HTTPException(status_code=400, detail="Cannot submit PR for this draw")
    await db.draws.update_one({'id': draw_id}, {'$set': {
        'status': 'pr_submitted', 'pr_url': req.pr_url,
        'pr_submitted_at': datetime.now(timezone.utc).isoformat()
    }})
    await award_xp(user['id'], 25)
    return {"message": "PR submitted", "pr_url": req.pr_url}

@api_router.post("/draws/{draw_id}/verify")
async def verify_pr(draw_id: str, user=Depends(auth_user)):
    draw = await db.draws.find_one({'id': draw_id, 'user_id': user['id']}, {'_id': 0})
    if not draw:
        raise HTTPException(status_code=404, detail="Draw not found")
    if draw['status'] != 'pr_submitted':
        raise HTTPException(status_code=400, detail="Submit PR first")
    now = datetime.now(timezone.utc).isoformat()
    await db.draws.update_one({'id': draw_id}, {'$set': {'status': 'merged', 'merged_at': now}})
    if user.get('active_bookmark') and user['active_bookmark'] and user['active_bookmark'].get('draw_id') == draw_id:
        await db.users.update_one({'id': user['id']}, {'$set': {'active_bookmark': None}})
    await award_xp(user['id'], 100)
    await db.users.update_one({'id': user['id']}, {'$inc': {'total_contributions': 1}})
    await update_streak(user['id'])
    new_badges = await check_badges(user['id'])
    await db.activity.insert_one({
        'id': str(uuid.uuid4()), 'user_id': user['id'],
        'username': user['username'],
        'avatar_url': user.get('avatar_url', ''),
        'action': 'merged', 'repo': draw.get('repo', ''),
        'title': draw.get('title', ''), 'timestamp': now
    })
    return {"message": "PR merged!", "xp_earned": 100, "new_badges": new_badges}


# --- History ---
@api_router.get("/draws/history")
async def get_history(user=Depends(auth_user), status: Optional[str] = None, language: Optional[str] = None):
    query = {'user_id': user['id']}
    if status:
        query['status'] = status
    if language:
        query['language'] = language
    draws = await db.draws.find(query, {'_id': 0}).sort('drawn_at', -1).limit(50).to_list(50)
    all_draws = await db.draws.find({'user_id': user['id']}, {'_id': 0}).to_list(1000)
    total = len(all_draws)
    bookmarked = sum(1 for d in all_draws if d['status'] in ('bookmarked', 'pr_submitted', 'merged'))
    merged = sum(1 for d in all_draws if d['status'] == 'merged')
    return {
        'draws': draws,
        'stats': {'total_draws': total, 'bookmark_rate': round(bookmarked / max(total, 1) * 100), 'merge_rate': round(merged / max(total, 1) * 100)}
    }


# --- Dashboard ---
@api_router.get("/dashboard")
async def get_dashboard(user=Depends(auth_user)):
    recent = await db.draws.find({'user_id': user['id']}, {'_id': 0}).sort('drawn_at', -1).limit(5).to_list(5)
    merged = await db.draws.find({'user_id': user['id'], 'status': 'merged'}, {'_id': 0}).to_list(1000)
    heatmap = {}
    for d in merged:
        try:
            day = datetime.fromisoformat(d['merged_at']).strftime('%Y-%m-%d')
            heatmap[day] = heatmap.get(day, 0) + 1
        except Exception:
            pass
    fresh = await db.users.find_one({'id': user['id']}, {'_id': 0})
    return {'user': fresh, 'recent_draws': recent, 'heatmap': heatmap, 'badges_meta': BADGES_META}


# --- Leaderboard ---
@api_router.get("/leaderboard")
async def get_leaderboard(period: str = "all-time"):
    users = await db.users.find({}, {'_id': 0}).sort('xp', -1).limit(50).to_list(50)
    for i, u in enumerate(users):
        u['rank'] = i + 1
    return {'users': users, 'period': period}


# --- Profile ---
@api_router.get("/profile/{username}")
async def get_profile(username: str):
    user = await db.users.find_one({'username': username}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    merged = await db.draws.find({'user_id': user['id'], 'status': 'merged'}, {'_id': 0}).sort('merged_at', -1).limit(10).to_list(10)
    safe = {k: v for k, v in user.items() if k not in ('redraws_today', 'last_redraw_date')}
    return {'user': safe, 'recent_merges': merged}


# --- Stats & Activity ---
@api_router.get("/stats")
async def get_stats():
    return {
        'issues_resolved': await db.draws.count_documents({'status': 'merged'}),
        'active_authors': await db.users.count_documents({}),
        'repositories_reached': len(await db.draws.distinct('repo')),
    }

@api_router.get("/activity")
async def get_activity():
    return await db.activity.find({}, {'_id': 0}).sort('timestamp', -1).limit(10).to_list(10)

@api_router.put("/users/filters")
async def update_filters(filters: FilterUpdate, user=Depends(auth_user)):
    await db.users.update_one({'id': user['id']}, {'$set': {'filters': filters.model_dump()}})
    return {"message": "Filters updated"}


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    if await db.cached_issues.count_documents({}) == 0:
        issues = _mock_issues()
        await db.cached_issues.insert_many([{**i} for i in issues])
        logger.info(f"Seeded {len(issues)} issues")
    if await db.users.count_documents({}) == 0:
        users = _mock_users()
        await db.users.insert_many([{**u} for u in users])
        logger.info(f"Seeded {len(users)} users")
    if await db.activity.count_documents({}) == 0:
        acts = _mock_activity()
        await db.activity.insert_many([{**a} for a in acts])
        logger.info(f"Seeded {len(acts)} activities")

@app.on_event("shutdown")
async def shutdown():
    client.close()


# --- Mock Data ---
def _mock_issues():
    data = [
        ('facebook/react', 'Fix accessibility labels in Dialog component', 215000, 'JavaScript', ['good first issue', 'accessibility'], 'Beginner'),
        ('microsoft/vscode', 'Add keyboard shortcut for folder collapse', 155000, 'TypeScript', ['good first issue', 'feature-request'], 'Beginner'),
        ('rust-lang/rust', 'Improve borrow checker error hint', 89000, 'Rust', ['good first issue', 'diagnostics'], 'Intermediate'),
        ('django/django', 'Add test for DateTimeField edge case', 74000, 'Python', ['good first issue', 'tests'], 'Beginner'),
        ('golang/go', 'Document context cancellation in net/http', 118000, 'Go', ['documentation', 'help wanted'], 'Intermediate'),
        ('vercel/next.js', 'Fix hydration mismatch in App Router', 120000, 'TypeScript', ['good first issue', 'bug'], 'Intermediate'),
        ('pallets/flask', 'Improve Blueprint error handling', 65000, 'Python', ['good first issue', 'enhancement'], 'Beginner'),
        ('tokio-rs/tokio', 'Add TcpStream connect timeout config', 23000, 'Rust', ['help wanted', 'enhancement'], 'Advanced'),
        ('sveltejs/svelte', 'Fix transition animation on mount', 76000, 'JavaScript', ['good first issue', 'bug'], 'Intermediate'),
        ('denoland/deno', 'Add permission prompt for --allow-ffi', 92000, 'TypeScript', ['good first issue', 'security'], 'Beginner'),
        ('fastapi/fastapi', 'Document WebSocket dependency injection', 68000, 'Python', ['documentation', 'good first issue'], 'Beginner'),
        ('pytorch/pytorch', 'Fix CUDA memory leak in autograd', 76000, 'Python', ['module: autograd', 'bug'], 'Advanced'),
        ('kubernetes/kubernetes', 'Add unit tests for scheduler plugin', 105000, 'Go', ['good first issue', 'area/test'], 'Intermediate'),
        ('tauri-apps/tauri', 'Fix window resize on macOS Sonoma', 75000, 'Rust', ['bug', 'platform: macOS'], 'Advanced'),
        ('expressjs/express', 'Update README for ES modules syntax', 63000, 'JavaScript', ['good first issue', 'documentation'], 'Beginner'),
        ('ansible/ansible', 'Add docker_container idempotency test', 59000, 'Python', ['good first issue', 'module'], 'Intermediate'),
        ('rails/rails', 'Fix N+1 query in ActionMailbox routing', 54000, 'Ruby', ['bug', 'actionmailbox'], 'Advanced'),
        ('flutter/flutter', 'Improve missing asset error message', 160000, 'Dart', ['good first issue', 'tool'], 'Beginner'),
        ('elixir-lang/elixir', 'Add Stream.resource/3 doc example', 23000, 'Elixir', ['documentation', 'good first issue'], 'Beginner'),
        ('apache/kafka', 'Optimize consumer group rebalance', 27000, 'Java', ['help wanted', 'consumer'], 'Advanced'),
        ('vitejs/vite', 'Fix HMR for CSS modules with postcss', 64000, 'TypeScript', ['good first issue', 'bug'], 'Intermediate'),
        ('prisma/prisma', 'Add composite type schema validation', 36000, 'TypeScript', ['good first issue', 'enhancement'], 'Intermediate'),
        ('neovim/neovim', 'Fix floating window border on resize', 74000, 'C', ['bug', 'tui'], 'Advanced'),
        ('gin-gonic/gin', 'Document middleware execution order', 75000, 'Go', ['documentation', 'good first issue'], 'Beginner'),
        ('scikit-learn/scikit-learn', 'Fix cross-validation imbalanced data', 57000, 'Python', ['help wanted', 'enhancement'], 'Intermediate'),
        ('huggingface/transformers', 'Fix tokenizer padding for batch', 120000, 'Python', ['good first issue', 'bug'], 'Intermediate'),
        ('spring-projects/spring-boot', 'Add virtual threads autoconfig', 72000, 'Java', ['enhancement', 'help wanted'], 'Intermediate'),
        ('grafana/grafana', 'Fix dashboard variable in alerting', 59000, 'TypeScript', ['bug', 'area/alerting'], 'Advanced'),
    ]
    return [{
        'id': str(uuid.uuid4()), 'github_id': random.randint(100000, 999999),
        'repo': d[0], 'title': d[1], 'stars': d[2], 'language': d[3],
        'labels': d[4], 'difficulty': d[5],
        'url': f"https://github.com/{d[0]}/issues/{random.randint(1000, 9999)}",
        'created_at': (datetime.now(timezone.utc) - timedelta(days=random.randint(1, 25))).isoformat(),
        'synced_at': datetime.now(timezone.utc).isoformat(),
    } for d in data]

def _mock_users():
    names = ['sarah-chen', 'alex-rust', 'dev-maya', 'code-ninja', 'byte-smith', 'luna-dev', 'max-code', 'pixel-jane']
    result = []
    for n in names:
        xp = random.randint(50, 5000)
        result.append({
            'id': str(uuid.uuid4()), 'github_id': random.randint(10000, 99999),
            'username': n, 'display_name': n.replace('-', ' ').title(),
            'avatar_url': f'https://api.dicebear.com/7.x/identicon/svg?seed={n}',
            'xp': xp, 'level': calc_level(xp),
            'current_streak': random.randint(0, 30), 'longest_streak': random.randint(5, 60),
            'last_contribution_date': (datetime.now(timezone.utc) - timedelta(days=random.randint(0, 5))).isoformat(),
            'total_contributions': random.randint(1, 50),
            'badges': [{'name': 'Prologue', 'earned_at': datetime.now(timezone.utc).isoformat()}] if random.random() > 0.3 else [],
            'filters': {'languages': [], 'difficulties': []},
            'active_bookmark': None,
            'joined_at': (datetime.now(timezone.utc) - timedelta(days=random.randint(30, 365))).isoformat(),
            'redraws_today': 0, 'last_redraw_date': None,
        })
    return result

def _mock_activity():
    repos = ['facebook/react', 'microsoft/vscode', 'vercel/next.js', 'django/django', 'rust-lang/rust']
    titles = ['Fix accessibility labels', 'Add keyboard shortcut', 'Fix hydration warning', 'Add test coverage', 'Improve error message']
    users = ['sarah-chen', 'alex-rust', 'dev-maya', 'code-ninja', 'byte-smith']
    result = []
    for _ in range(8):
        u = random.choice(users)
        result.append({
            'id': str(uuid.uuid4()), 'user_id': str(uuid.uuid4()),
            'username': u, 'avatar_url': f'https://api.dicebear.com/7.x/identicon/svg?seed={u}',
            'action': 'merged', 'repo': random.choice(repos),
            'title': random.choice(titles),
            'timestamp': (datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 48))).isoformat(),
        })
    return result
