import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Target,
  Flame,
  Trophy,
  GitPullRequest,
  Zap,
  Clock,
  ArrowRight,
  Star,
  History,
  Bookmark,
  GitMerge,
  ChevronRight,
  Calendar,
  Activity,
  Medal,
  Crown,
  Sparkles
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { colors } from '@/lib/theme';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

// Progress Ring Component
function ProgressRing({ progress, size = 120, strokeWidth = 8, children }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`rgb(${colors.accent.rgb})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{
            strokeDasharray: circumference,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ icon: Icon, label, value, subtext, onClick }) {
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ scale: 1.02, y: -2 }}
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-2xl border bg-zinc-900/50 p-5
        border-zinc-800 hover:border-amber-500/30 transition-all
        ${onClick ? 'cursor-pointer' : ''}
      `}
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="p-2 rounded-xl bg-amber-500/10">
            <Icon className="w-5 h-5 text-amber-300" />
          </div>
        </div>
        <p className="text-3xl font-bold text-zinc-100">{value}</p>
        <p className="text-sm text-zinc-500 mt-1">{label}</p>
        {subtext && <p className="text-xs text-zinc-600 mt-2">{subtext}</p>}
      </div>
    </motion.div>
  );
}

// Active Bookmark Card
function ActiveBookmarkCard({ bookmark, onClick }) {
  const expiresIn = useMemo(() => {
    if (!bookmark.expires_at) return null;
    const diff = new Date(bookmark.expires_at) - Date.now();
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
  }, [bookmark.expires_at]);

  const isPRSubmitted = bookmark.status === 'pr_submitted';

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      onClick={onClick}
      className={`
        relative rounded-xl border p-4 cursor-pointer transition-all
        ${isPRSubmitted 
          ? 'bg-amber-950/20 border-amber-500/30' 
          : 'bg-zinc-900/50 border-zinc-800 hover:border-amber-500/20'
        }
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isPRSubmitted ? 'bg-amber-500/20' : 'bg-amber-500/10'}`}>
          {isPRSubmitted ? (
            <GitPullRequest className="w-4 h-4 text-amber-300" />
          ) : (
            <Bookmark className="w-4 h-4 text-amber-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-300 truncate">{bookmark.issue?.title}</p>
          <p className="text-xs text-zinc-500 truncate mt-0.5">
            {bookmark.issue?.repo_owner}/{bookmark.issue?.repo_name}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              isPRSubmitted 
                ? 'bg-amber-500/20 text-amber-300' 
                : 'bg-amber-500/10 text-amber-400'
            }`}>
              {isPRSubmitted ? 'PR Submitted' : 'Active'}
            </span>
            {!isPRSubmitted && expiresIn && (
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {expiresIn}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function RecentDrawCard({ draw }) {
  const timeAgo = useMemo(() => {
    if (!draw.created_at) return '';
    const diff = Date.now() - new Date(draw.created_at);
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'just now';
    if (hours === 1) return '1h ago';
    return `${hours}h ago`;
  }, [draw.created_at]);

  return (
    <motion.a
      href={draw.issue?.url || draw.issue_url}
      target="_blank"
      rel="noopener noreferrer"
      whileHover={{ scale: 1.02 }}
      className="relative rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-blue-500/20 p-4 cursor-pointer transition-all block"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-blue-500/10">
          <Star className="w-4 h-4 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-300 truncate">{draw.issue?.title || draw.issue_title}</p>
          <p className="text-xs text-zinc-500 truncate mt-0.5">
            {draw.issue?.repo_owner || draw.repo_owner}/{draw.issue?.repo_name || draw.repo_name}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
              Drawn
            </span>
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo}
            </span>
          </div>
        </div>
      </div>
    </motion.a>
  );
}

// XP Progress Bar
function XPProgress({ currentXP, level }) {
  const xpInLevel = currentXP % 500;
  const progress = (xpInLevel / 500) * 100;
  const xpToNext = 500 - xpInLevel;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">Level {level}</span>
        <span className="text-zinc-500">{xpInLevel} / 500 XP</span>
      </div>
      <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: `rgb(${colors.accent.rgb})` }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
      <p className="text-xs text-zinc-600">{xpToNext} XP to Level {level + 1}</p>
    </div>
  );
}

// Heatmap Component
function MiniHeatmap({ data }) {
  const weeks = 12;
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
    <div className="flex gap-[2px]">
      {grid.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[2px]">
          {week.map(day => (
            <Tooltip key={day.date}>
              <TooltipTrigger asChild>
                <div
                  className="w-2.5 h-2.5 rounded-sm transition-colors hover:scale-125"
                  style={{
                    backgroundColor: day.count === 0
                      ? 'rgba(255,255,255,0.05)'
                      : `rgba(${colors.accent.rgb}, ${Math.min(day.count * 0.2 + 0.2, 0.9)})`,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{day.date}: {day.count} contributions</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      ))}
    </div>
  );
}

const DEFAULT_DAILY_DRAW_LIMIT = 3;

export default function Dashboard() {
  const { user, setShowLogin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activeBookmarks, setActiveBookmarks] = useState([]);
  const [drawsRemaining, setDrawsRemaining] = useState(3);
  const [recentDrawnItems, setRecentDrawnItems] = useState([]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadDashboard = async () => {
      try {
        // Get daily draw limit from user
        const dailyDrawLimit = user?.daily_draw_limit || DEFAULT_DAILY_DRAW_LIMIT;
        
        // Load dashboard data and draws history
        const [dashboardRes, bookmarksRes, drawsRes, drawnRes] = await Promise.all([
          api.get('/users/dashboard'),
          Promise.all([
            api.get('/draws/history', { params: { status: 'bookmarked', limit: 5 } }),
            api.get('/draws/history', { params: { status: 'pr_submitted', limit: 5 } }),
          ]),
          api.get('/draws/history', { params: { limit: dailyDrawLimit } }),
          api.get('/draws/history', { params: { status: 'drawn', limit: 5 } }),
        ]);

        const dashboardData = dashboardRes._data;
        
        // Convert heatmap to object
        const heatmapObj = {};
        if (Array.isArray(dashboardData.heatmap)) {
          dashboardData.heatmap.forEach(item => {
            if (item.day) heatmapObj[item.day] = item.count;
          });
        }

        setData({
          user: dashboardData.user,
          heatmap: heatmapObj,
          badges: dashboardData.badges || [],
          recentDraws: dashboardData.recent_draws || [],
        });

        // Combine active bookmarks
        const bookmarks = [
          ...(bookmarksRes[0]._data || []),
          ...(bookmarksRes[1]._data || []),
        ];
        setActiveBookmarks(bookmarks);

        // Recent un-bookmarked draws (last 24h)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentDrawn = (drawnRes._data || []).filter(d => {
          const created = new Date(d.created_at);
          return !Number.isNaN(created.getTime()) && created >= oneDayAgo;
        });
        setRecentDrawnItems(recentDrawn);

        // Calculate remaining draws
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const draws = drawsRes._data || [];
        const usedToday = draws.filter((draw) => {
          if (!draw.created_at) return false;
          const createdAt = new Date(draw.created_at);
          return !Number.isNaN(createdAt.getTime()) && createdAt >= today;
        }).length;
        setDrawsRemaining(Math.max(0, dailyDrawLimit - usedToday));
      } catch (err) {
        console.error('Failed to load dashboard:', err);
        toast.error('Failed to load dashboard');
        // Set defaults on error
        setDrawsRemaining(user?.daily_draw_limit || DEFAULT_DAILY_DRAW_LIMIT);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [user]);

  const stats = useMemo(() => {
    if (!user) return null;
    return {
      xp: user.xp || 0,
      level: user.level || 1,
      contributions: user.total_contributions || 0,
      currentStreak: user.current_streak || 0,
      longestStreak: user.longest_streak || 0,
      drawsRemaining: drawsRemaining,
      activeWork: activeBookmarks.length,
    };
  }, [user, drawsRemaining, activeBookmarks]);

  if (loading) {
    return (
      <div className="min-h-screen pt-20 px-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="h-40 rounded-2xl bg-zinc-900/50 animate-pulse" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 rounded-2xl bg-zinc-900/50 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen pt-24 px-6 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-2xl bg-amber-500/20 flex items-center justify-center mx-auto mb-6">
            <Target className="w-10 h-10 text-amber-400" />
          </div>
          <h2 className="text-3xl font-bold text-zinc-100 mb-3">
            Start Your Journey
          </h2>
          <p className="text-zinc-500 mb-8">
            Sign in to track your progress, earn badges, and build your contribution streak.
          </p>
          <Button
            onClick={() => setShowLogin(true)}
            className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-8 py-3 text-base font-semibold"
          >
            Sign In to Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen pt-20 pb-24 px-6">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="max-w-6xl mx-auto space-y-6"
        >
          {/* Hero Section */}
          <motion.div variants={itemVariants} className="relative">
            <div 
              className="absolute inset-0 rounded-3xl blur-3xl" 
              style={{ background: `radial-gradient(ellipse at center, rgba(${colors.accent.rgb},0.08) 0%, transparent 70%)` }}
            />
            <div className="relative bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 overflow-hidden">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className="relative">
                    <ProgressRing progress={(stats.xp % 500) / 5} size={100} strokeWidth={6}>
                      <div className="text-center">
                        <span className="text-2xl font-bold text-zinc-100">{stats.level}</span>
                        <p className="text-xs text-zinc-500">Level</p>
                      </div>
                    </ProgressRing>
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-zinc-100 mb-1">
                      Welcome back, {user.display_name || user.username}
                    </h1>
                    <p className="text-zinc-500">
                      {stats.currentStreak > 0 ? (
                        <span className="flex items-center gap-2">
                          <Flame className="w-4 h-4 text-amber-400" />
                          {stats.currentStreak} day streak! Keep it up!
                        </span>
                      ) : (
                        'Start your streak by contributing today'
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={() => navigate('/discover')}
                    className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold"
                  >
                    <Target className="w-4 h-4 mr-2" />
                    {stats.drawsRemaining > 0 
                      ? `Draw Issue (${stats.drawsRemaining} left)` 
                      : 'Browse Issues'
                    }
                  </Button>
                  {stats.activeWork > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => navigate('/history')}
                      className="border-zinc-700 hover:bg-zinc-800"
                    >
                      <History className="w-4 h-4 mr-2" />
                      View History
                    </Button>
                  )}
                </div>
              </div>

              {/* XP Progress */}
              <div className="mt-8 max-w-md">
                <XPProgress currentXP={stats.xp} level={stats.level} />
              </div>
            </div>
          </motion.div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={GitMerge}
              label="Contributions"
              value={stats.contributions}
              subtext="Total merged PRs"
              onClick={() => navigate('/history')}
            />
            
            <StatCard
              icon={Flame}
              label="Current Streak"
              value={stats.currentStreak}
              subtext="Days in a row"
            />
            
            <StatCard
              icon={Trophy}
              label="Longest Streak"
              value={stats.longestStreak}
              subtext="Personal best"
            />
            
            <StatCard
              icon={Zap}
              label="Total XP"
              value={stats.xp.toLocaleString()}
              subtext={`Level ${stats.level}`}
            />
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Active Work */}
            <div className="lg:col-span-2 space-y-6">
              {/* Active Work */}
              <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/10">
                      <Activity className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-100">Active Work</h2>
                      <p className="text-sm text-zinc-500">
                        {stats.activeWork} of 5 slots used
                      </p>
                    </div>
                  </div>
                  <Link 
                    to="/discover" 
                    className="text-sm text-amber-400 hover:text-amber-300 flex items-center gap-1"
                  >
                    Find issues
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>

                {activeBookmarks.length === 0 ? (
                  <div className="text-center py-8 bg-zinc-900/30 rounded-xl border border-dashed border-zinc-800">
                    <Target className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                    <p className="text-zinc-500 mb-4">No active work</p>
                    <Button
                      onClick={() => navigate('/discover')}
                      variant="outline"
                      className="border-zinc-700"
                    >
                      Discover Issues
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {activeBookmarks.slice(0, 5).map(bookmark => (
                      <ActiveBookmarkCard
                        key={bookmark.id}
                        bookmark={bookmark}
                        onClick={() => navigate('/history')}
                      />
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Recent Draws (un-bookmarked, last 24h) */}
              {recentDrawnItems.length > 0 && (
                <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-blue-500/10">
                        <Clock className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-zinc-100">Recent Draws</h2>
                        <p className="text-sm text-zinc-500">Drawn in the last 24h — bookmark before they fade</p>
                      </div>
                    </div>
                    <Link
                      to="/history"
                      className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      View all
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                  <div className="grid gap-3">
                    {recentDrawnItems.map((draw) => (
                      <RecentDrawCard key={draw.id} draw={draw} />
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Recent Activity */}
              <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/10">
                      <GitMerge className="w-5 h-5 text-amber-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-zinc-100">Recent Merges</h2>
                  </div>
                </div>

                {data?.recentDraws?.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500">
                    <p>No merged PRs yet. Submit your first PR to see it here!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data?.recentDraws?.slice(0, 5).map((draw, i) => (
                      <motion.div
                        key={draw.id || i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-amber-500/20 transition-colors"
                      >
                        <div className="p-2 rounded-lg bg-amber-500/10">
                          <GitMerge className="w-4 h-4 text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-300 truncate">
                            {draw.repo}
                          </p>
                          <p className="text-xs text-zinc-500">
                            +{draw.xp_awarded || 25} XP
                          </p>
                        </div>
                        <span className="text-xs text-amber-400 font-medium">
                          Merged
                        </span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>

            {/* Right Column - Secondary Info */}
            <div className="space-y-6">
              {/* Streak Card */}
              <motion.div 
                variants={itemVariants} 
                className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6"
                style={{ 
                  background: `linear-gradient(135deg, rgba(${colors.accent.rgb},0.05), transparent)` 
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <Flame className="w-6 h-6 text-amber-400" />
                  <h3 className="font-semibold text-zinc-100">Streak</h3>
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-4xl font-bold text-zinc-100">{stats.currentStreak}</span>
                  <span className="text-zinc-500">days</span>
                </div>
                <p className="text-sm text-zinc-500 mb-4">
                  {stats.currentStreak > 0 
                    ? 'Keep contributing daily to maintain your streak!'
                    : 'Contribute today to start a streak!'
                  }
                </p>
                <MiniHeatmap data={data?.heatmap || {}} />
              </motion.div>

              {/* Badges Preview */}
              <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Medal className="w-5 h-5 text-amber-400" />
                    <h3 className="font-semibold text-zinc-100">Badges</h3>
                  </div>
                  <Link to="/history" className="text-xs text-zinc-500 hover:text-zinc-400">
                    View all
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(data?.badges || []).slice(0, 6).map(badge => (
                    <Tooltip key={badge.name}>
                      <TooltipTrigger asChild>
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                          <Star className="w-5 h-5 text-amber-400" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{badge.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {(data?.badges || []).length === 0 && (
                    <p className="text-sm text-zinc-500">Complete quests to earn badges!</p>
                  )}
                </div>
              </motion.div>

              {/* Quick Actions */}
              <motion.div variants={itemVariants} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                <h3 className="font-semibold text-zinc-100 mb-4">Quick Actions</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => navigate('/discover')}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors text-left"
                  >
                    <Target className="w-5 h-5 text-amber-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-zinc-200">Find an Issue</p>
                      <p className="text-xs text-zinc-500">
                        {stats.drawsRemaining > 0 
                          ? `${stats.drawsRemaining} draws remaining today`
                          : 'Browse all issues'
                        }
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-600" />
                  </button>

                  <button
                    onClick={() => navigate('/history')}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors text-left"
                  >
                    <History className="w-5 h-5 text-zinc-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-zinc-200">View History</p>
                      <p className="text-xs text-zinc-500">
                        {stats.contributions} contributions
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-600" />
                  </button>

                  <button
                    onClick={() => navigate('/leaderboard')}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors text-left"
                  >
                    <Crown className="w-5 h-5 text-amber-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-zinc-200">Leaderboard</p>
                      <p className="text-xs text-zinc-500">See top contributors</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-600" />
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </TooltipProvider>
  );
}
