import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion } from 'framer-motion';
import { PenTool, Flame, Trophy, GitPullRequest, BookOpen, Star, Files, Library, BookCopy, MoonStar, FastForward, Globe, Search, Bookmark as BookmarkIcon, Clock } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BADGE_ICONS = {
  'Prologue': BookOpen, 'Short Story': Files, 'The Epic': Library,
  'Anthology': BookCopy, 'Midnight Draft': MoonStar, 'Fast Forward': FastForward,
  'Daily Author': PenTool, 'Worldbuilder': Globe, 'Proofreader': Search,
  'The Archivist': BookmarkIcon,
};

const STATUS_COLORS = {
  drawn: 'bg-zinc-500/10 text-zinc-400', bookmarked: 'bg-amber-500/10 text-amber-400',
  pr_submitted: 'bg-blue-500/10 text-blue-400', merged: 'bg-emerald-500/10 text-emerald-400',
  expired: 'bg-red-500/10 text-red-400',
};

export default function Dashboard() {
  const { user, token, setShowLogin } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setShowLogin(true); return; }
    axios.get(`${API}/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, setShowLogin]);

  if (!user || loading) return (
    <div className="pt-20 px-4 md:px-8 lg:px-12 max-w-6xl mx-auto">
      <div className="grid gap-6 mt-8">{[1,2,3].map(i => <div key={i} className="h-32 rounded-xl shimmer" />)}</div>
    </div>
  );

  const u = data?.user || user;
  const xpProgress = ((u.xp % 500) / 500) * 100;
  const xpToNext = 500 - (u.xp % 500);
  const earned = new Set((u.badges || []).map(b => b.name));

  return (
    <div className="pt-20 pb-16 px-4 md:px-8 lg:px-12 max-w-6xl mx-auto" data-testid="dashboard-page">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Profile Card */}
        <Card className="mb-8 border-border/50" data-testid="profile-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-5">
              <Avatar className="w-16 h-16 border-2 border-amber-500/30">
                <AvatarImage src={u.avatar_url} />
                <AvatarFallback className="text-xl font-serif">{u.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-xl font-bold font-serif truncate">{u.display_name || u.username}</h2>
                  <span className="text-xs font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded font-bold">Lv.{u.level}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">@{u.username}</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-mono">{u.xp} XP</span>
                    <span className="text-muted-foreground font-mono">{xpToNext} XP to Lv.{u.level + 1}</span>
                  </div>
                  <Progress value={xpProgress} className="h-2 bg-secondary" data-testid="xp-progress" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="stats-grid">
          {[
            { label: 'Contributions', value: u.total_contributions, icon: GitPullRequest },
            { label: 'Current Streak', value: u.current_streak, icon: Flame },
            { label: 'Longest Streak', value: u.longest_streak, icon: Trophy },
            { label: 'Level', value: u.level, icon: Star },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="border-border/50">
              <CardContent className="p-4">
                <Icon className="w-4 h-4 text-amber-500 mb-2" />
                <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Streak Indicator */}
        <div className="flex items-center gap-4 mb-8 p-5 rounded-xl border border-border/50 bg-card" data-testid="streak-indicator">
          <div className={`p-3 rounded-full ${u.current_streak > 0 ? 'bg-amber-500/15 animate-pulse-gold' : 'bg-secondary'}`}>
            <PenTool className={`w-7 h-7 ${u.current_streak > 0 ? 'text-amber-500' : 'text-zinc-600'}`} />
          </div>
          <div>
            <p className="font-medium">
              {u.current_streak > 0
                ? <><span className="text-amber-500 font-mono font-bold">{u.current_streak}-day</span> streak active</>
                : 'No active streak'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {u.current_streak > 0 ? 'Keep it going! Merge a PR every 48 hours.' : 'Merge a PR to start your streak.'}
            </p>
          </div>
        </div>

        {/* Badges */}
        <Card className="mb-8 border-border/50" data-testid="badge-grid">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Badges</CardTitle>
          </CardHeader>
          <CardContent>
            <TooltipProvider>
              <div className="grid grid-cols-5 md:grid-cols-10 gap-3">
                {(data?.badges_meta || []).map((badge) => {
                  const Icon = BADGE_ICONS[badge.name] || Star;
                  const isEarned = earned.has(badge.name);
                  return (
                    <Tooltip key={badge.name}>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border cursor-default ${
                            isEarned ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/30 bg-secondary/30 opacity-40'
                          }`}
                          data-testid={`badge-${badge.name.toLowerCase().replace(/\s/g, '-')}`}
                        >
                          <Icon className={`w-6 h-6 ${isEarned ? 'text-amber-500' : 'text-zinc-600'}`} />
                          <span className="text-[10px] text-center leading-tight">{badge.name}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="bg-card border-border"><p className="text-xs">{badge.description}</p></TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>

        {/* Heatmap */}
        <Card className="mb-8 border-border/50" data-testid="contribution-heatmap">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Contributions</CardTitle>
          </CardHeader>
          <CardContent>
            <Heatmap data={data?.heatmap || {}} />
          </CardContent>
        </Card>

        {/* Recent Draws */}
        <Card className="border-border/50" data-testid="recent-draws">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Recent Draws</CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.recent_draws || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No draws yet. Visit Discover to draw your first issue!</p>
            ) : (
              <div className="space-y-3">
                {data.recent_draws.map(draw => (
                  <div key={draw.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{draw.repo}</p>
                      <p className="text-sm font-medium truncate">{draw.title}</p>
                    </div>
                    <Badge variant="secondary" className={`text-xs shrink-0 ${STATUS_COLORS[draw.status] || ''}`}>
                      {draw.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function Heatmap({ data }) {
  const weeks = 26;
  const today = new Date();
  const grid = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - (w * 7 + (6 - d)));
      const key = date.toISOString().split('T')[0];
      week.push({ date: key, count: data[key] || 0 });
    }
    grid.push(week);
  }
  return (
    <div className="flex gap-[3px] overflow-x-auto pb-2">
      {grid.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map(day => (
            <div
              key={day.date}
              className="w-3 h-3 rounded-sm"
              style={{
                backgroundColor: day.count === 0 ? 'rgba(255,255,255,0.04)' : `rgba(245, 158, 11, ${Math.min(day.count * 0.3 + 0.2, 1)})`,
              }}
              title={`${day.date}: ${day.count} contributions`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
