import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion } from 'framer-motion';
import { PenTool, Flame, Trophy, GitPullRequest, BookOpen, Star, Files, Library, BookCopy, MoonStar, FastForward, Globe, Search, Bookmark as BookmarkIcon, Zap } from 'lucide-react';
import { api } from '@/lib/api';

const BADGE_ICONS = {
  'Prologue': BookOpen, 'Short Story': Files, 'The Epic': Library,
  'Anthology': BookCopy, 'Midnight Draft': MoonStar, 'Fast Forward': FastForward,
  'Daily Author': PenTool, 'Worldbuilder': Globe, 'Proofreader': Search,
  'The Archivist': BookmarkIcon,
};

export default function Dashboard() {
  const { user, setShowLogin } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    api.get('/users/dashboard')
      .then(r => {
        const d = r._data;
        // Convert heatmap array to object keyed by date
        const heatmapObj = {};
        if (Array.isArray(d.heatmap)) {
          d.heatmap.forEach(item => {
            if (item.day) heatmapObj[item.day] = item.count;
          });
        }
        setData({
          user: d.user,
          recent_draws: (d.recent_draws || []).map(draw => ({
            id: draw.id,
            repo: `${draw.repo_owner || ''}/${draw.repo_name || ''}`,
            language: draw.language,
            xp_awarded: draw.xp_awarded,
            status: 'merged',
          })),
          heatmap: heatmapObj,
          badges: d.badges || [],
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return (
    <div className="pt-20 px-6 sm:px-8 lg:px-12 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">{[1,2,3,4].map(i => <div key={i} className="h-32 rounded-xl shimmer" />)}</div>
    </div>
  );

  if (!user) return (
    <div className="pt-20 px-6 sm:px-8 lg:px-12 max-w-4xl mx-auto text-center" data-testid="dashboard-login-prompt">
      <div className="py-20">
        <h2 className="text-2xl font-bold font-display mb-4" style={{ letterSpacing: '-0.04em' }}>Sign in to view your dashboard</h2>
        <p className="text-zinc-400 mb-6">Track your contributions, badges, and streaks.</p>
        <button onClick={() => setShowLogin(true)} className="rune-btn px-8 py-3 rounded-lg" data-testid="dashboard-sign-in">Sign In</button>
      </div>
    </div>
  );

  const u = data?.user || user;
  const xpProgress = ((u.xp % 500) / 500) * 100;
  const xpToNext = 500 - (u.xp % 500);
  const badgeMap = new Map((data?.badges || []).map(b => [b.name, b]));
  const earned = new Set(badgeMap.keys());

  return (
    <div className="pt-20 pb-16 relative" data-testid="dashboard-page">
      <div className="absolute top-0 left-1/3 w-[500px] h-[300px] pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(251,191,36,0.06) 0%, transparent 70%)' }} />

      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <span className="font-mono text-[10px] text-amber-400/60 uppercase tracking-[0.3em] block mb-4">Dashboard</span>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold mb-8 tracking-tight" style={{ letterSpacing: '-0.06em' }}>
            Your journey so far.
          </h1>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="bento-grid">

            {/* Profile Card - spans 2 cols */}
            <div className="md:col-span-2 obsidian inner-glow rounded-xl p-6" data-testid="profile-card">
              <div className="flex items-center gap-5">
                <div className="relative">
                  <div className="absolute -inset-1 rounded-full bg-amber-400/15 blur-md" />
                  <Avatar className="relative w-16 h-16 border-2 border-amber-400/25">
                    <AvatarImage src={u.avatar_url} />
                    <AvatarFallback className="text-xl font-display bg-zinc-900">{u.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-xl font-bold font-display truncate" style={{ letterSpacing: '-0.04em' }}>{u.display_name || u.username}</h2>
                    <span className="text-xs font-mono text-amber-200 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20 font-bold">Lv.{u.level}</span>
                  </div>
                  <p className="text-sm text-zinc-500 font-mono mb-3">@{u.username}</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-amber-200">{u.xp} XP</span>
                      <span className="text-zinc-600">{xpToNext} to Lv.{u.level + 1}</span>
                    </div>
                    <Progress value={xpProgress} className="h-2 bg-zinc-900" data-testid="xp-progress" />
                  </div>
                </div>
              </div>
            </div>

            {/* Streak */}
            <div className="obsidian rounded-xl p-5 flex items-center gap-4" data-testid="streak-indicator">
              <div className={`p-3 rounded-full ${u.current_streak > 0 ? 'bg-amber-400/10 animate-pulse-glow' : 'bg-zinc-900'}`}>
                <PenTool className={`w-6 h-6 ${u.current_streak > 0 ? 'text-amber-300' : 'text-zinc-700'}`} strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-mono text-2xl font-bold text-zinc-100">{u.current_streak}</p>
                <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Day Streak</p>
              </div>
            </div>

            {/* XP Quick */}
            <div className="obsidian inner-glow rounded-xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 rounded-full" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.1), transparent)', filter: 'blur(20px)' }} />
              <Zap className="w-4 h-4 text-amber-300 mb-2" strokeWidth={1.5} />
              <p className="font-mono text-2xl font-bold text-zinc-100">{u.xp}</p>
              <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Total XP</p>
            </div>

            {/* Stats Row - 4 compact cells */}
            {[
              { label: 'Contributions', value: u.total_contributions, icon: GitPullRequest, color: 'text-amber-300' },
              { label: 'Current Streak', value: u.current_streak, icon: Flame, color: 'text-amber-400/60' },
              { label: 'Longest Streak', value: u.longest_streak, icon: Trophy, color: 'text-amber-400/60' },
              { label: 'Level', value: u.level, icon: Star, color: 'text-amber-300' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="obsidian rounded-xl p-4" data-testid="stats-grid">
                <Icon className={`w-4 h-4 ${color} mb-2`} strokeWidth={1.5} />
                <p className="text-xl font-bold font-mono text-zinc-100">{value}</p>
                <p className="text-xs text-zinc-600 font-mono mt-0.5">{label}</p>
              </div>
            ))}

            {/* Badges - full width */}
            <div className="md:col-span-3 lg:col-span-4 obsidian inner-glow rounded-xl p-6" data-testid="badge-grid">
              <h3 className="font-display text-lg font-semibold mb-4" style={{ letterSpacing: '-0.04em' }}>
                <span className="text-amber-400/60 font-mono text-sm">//</span> Badges
              </h3>
              <TooltipProvider>
                <div className="grid grid-cols-5 md:grid-cols-10 gap-3">
                  {Object.entries(BADGE_ICONS).map(([name, Icon]) => {
                    const isEarned = earned.has(name);
                    return (
                      <Tooltip key={name}>
                        <TooltipTrigger asChild>
                          <motion.div
                            whileHover={{ scale: 1.08, y: -2 }}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border cursor-default ${
                              isEarned
                                ? 'border-amber-400/25 bg-amber-400/8 shadow-[0_0_15px_-7px_rgba(251,191,36,0.5)]'
                                : 'border-white/5 bg-zinc-900/30 opacity-35'
                            }`}
                            data-testid={`badge-${name.toLowerCase().replace(/\s/g, '-')}`}
                          >
                            <Icon className={`w-6 h-6 ${isEarned ? 'text-amber-200' : 'text-zinc-700'}`} strokeWidth={1.5} />
                            <span className="text-[10px] text-center leading-tight font-mono">{name}</span>
                          </motion.div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-zinc-900 border-white/10"><p className="text-xs">{badgeMap.get(name)?.description || name}</p></TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            </div>

            {/* Heatmap */}
            <div className="md:col-span-2 lg:col-span-3 obsidian inner-glow rounded-xl p-6" data-testid="contribution-heatmap">
              <h3 className="font-display text-lg font-semibold mb-4" style={{ letterSpacing: '-0.04em' }}>
                <span className="text-amber-400/60 font-mono text-sm">//</span> Contributions
              </h3>
              <Heatmap data={data?.heatmap || {}} />
            </div>

            {/* Recent Draws */}
            <div className="md:col-span-1 lg:col-span-1 obsidian rounded-xl p-5" data-testid="recent-draws">
              <h3 className="font-display text-base font-semibold mb-4" style={{ letterSpacing: '-0.04em' }}>Recent</h3>
              {(data?.recent_draws || []).length === 0 ? (
                <p className="text-xs text-zinc-600 font-mono">No draws yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.recent_draws.map(draw => (
                    <div key={draw.id} className="p-2.5 rounded-lg bg-zinc-900/50 border border-white/5">
                      <p className="text-xs text-zinc-500 truncate font-mono">{draw.repo}</p>
                      <p className="text-xs font-medium text-zinc-300 truncate mt-0.5">{draw.language}</p>
                      <span className="inline-block text-[10px] px-1.5 py-0.5 rounded mt-1 font-mono status-merged">
                        {draw.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
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
                backgroundColor: day.count === 0
                  ? 'rgba(255,255,255,0.03)'
                  : `rgba(251, 191, 36, ${Math.min(day.count * 0.25 + 0.2, 0.9)})`,
                boxShadow: day.count > 0 ? `0 0 ${day.count * 3 + 2}px -1px rgba(251,191,36,${Math.min(day.count * 0.12 + 0.08, 0.4)})` : 'none',
              }}
              title={`${day.date}: ${day.count} contributions`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
