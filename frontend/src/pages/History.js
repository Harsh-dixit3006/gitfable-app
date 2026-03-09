import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FolderGit2, 
  ExternalLink, 
  Star, 
  GitPullRequest, 
  GitMerge, 
  Clock, 
  CheckCircle2, 
  Circle, 
  XCircle,
  Sparkles,
  ChevronDown,
  ChevronRight,
  History,
  Target,
  Trophy
} from 'lucide-react';
import { api } from '@/lib/api';
import { accent } from '@/lib/theme';

const STATUS_CONFIG = {
  drawn: { 
    label: 'Drawn', 
    icon: Circle, 
    color: 'text-zinc-500',
    bgColor: 'bg-zinc-500/10',
    borderColor: 'border-zinc-500/20'
  },
  bookmarked: { 
    label: 'Active', 
    icon: Clock, 
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    borderColor: 'border-blue-400/20'
  },
  pr_submitted: { 
    label: 'PR Sent', 
    icon: GitPullRequest, 
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
    borderColor: 'border-purple-400/20'
  },
  merged: { 
    label: 'Merged', 
    icon: GitMerge, 
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-400/10',
    borderColor: 'border-emerald-400/20'
  },
  expired: { 
    label: 'Expired', 
    icon: XCircle, 
    color: 'text-zinc-600',
    bgColor: 'bg-zinc-600/10',
    borderColor: 'border-zinc-600/20'
  },
};

const TIME_GROUPS = [
  { key: 'today', label: 'Today', days: 1 },
  { key: 'week', label: 'This Week', days: 7 },
  { key: 'month', label: 'This Month', days: 30 },
  { key: 'older', label: 'Earlier', days: Infinity },
];

// Normalize draw row from Go backend
function normalizeDraw(draw) {
  const issue = draw.issue || {};
  return {
    id: draw.id,
    status: draw.status,
    source: draw.source,
    pr_url: draw.pr_url,
    expires_at: draw.expires_at,
    merged_at: draw.merged_at,
    created_at: draw.created_at,
    repo: `${issue.repo_owner || ''}/${issue.repo_name || ''}`,
    repoOwner: issue.repo_owner || '',
    repoName: issue.repo_name || '',
    title: issue.title || '',
    url: issue.url || '',
    language: issue.language || '',
    difficulty: issue.difficulty || '',
    stars: issue.repo_stars || 0,
    labels: issue.labels || [],
    githubNumber: issue.github_number,
  };
}

// Format relative time
function getRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Get time group for a date
function getTimeGroup(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now - date) / 86400000);

  if (diffDays < 1) return 'today';
  if (diffDays < 7) return 'week';
  if (diffDays < 30) return 'month';
  return 'older';
}

// Compact History Card Component
function HistoryCard({ draw, onClick }) {
  const config = STATUS_CONFIG[draw.status] || STATUS_CONFIG.drawn;
  const StatusIcon = config.icon;
  const isMerged = draw.status === 'merged';
  const isExpired = draw.status === 'expired';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      onClick={onClick}
      className={`
        group relative flex items-center gap-3 p-3 rounded-xl cursor-pointer
        transition-all duration-200
        ${isMerged 
          ? 'bg-emerald-950/20 border border-emerald-500/20 hover:border-emerald-500/40' 
          : isExpired
            ? 'bg-zinc-900/30 border border-zinc-800/50 opacity-60'
            : 'bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700/50 hover:bg-zinc-800/30'
        }
      `}
    >
      {/* Status Icon */}
      <div className={`
        flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
        ${config.bgColor} ${config.borderColor} border
      `}>
        <StatusIcon className={`w-4 h-4 ${config.color}`} strokeWidth={2} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs text-zinc-500 font-mono truncate">
            {draw.repo}
          </span>
          <span className="text-zinc-700">·</span>
          <span className="text-xs text-zinc-600">
            {getRelativeTime(draw.created_at)}
          </span>
        </div>
        <h4 className={`
          text-sm font-medium truncate
          ${isMerged ? 'text-emerald-200' : 'text-zinc-300'}
        `}>
          {draw.title}
        </h4>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {draw.pr_url && (
          <a
            href={draw.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="View PR"
          >
            <GitPullRequest className="w-3.5 h-3.5" />
          </a>
        )}
        <a
          href={draw.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="View Issue"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Status Badge (mobile/compact view) */}
      <div className={`
        flex-shrink-0 hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium
        ${config.bgColor} ${config.color}
      `}>
        <StatusIcon className="w-3 h-3" />
        <span className="hidden md:inline">{config.label}</span>
      </div>
    </motion.div>
  );
}

// Time Group Section
function TimeGroupSection({ label, draws, isExpanded, onToggle }) {
  if (draws.length === 0) return null;

  return (
    <div className="mb-6">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 mb-3 text-zinc-500 hover:text-zinc-400 transition-colors group"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 transition-transform" />
        ) : (
          <ChevronRight className="w-4 h-4 transition-transform" />
        )}
        <span className="text-xs font-mono uppercase tracking-wider">{label}</span>
        <span className="text-xs text-zinc-600">({draws.length})</span>
      </button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {draws.map((draw) => (
              <HistoryCard key={draw.id} draw={draw} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Stats Card
function StatCard({ icon: Icon, label, value, subtext, color }) {
  const colorClasses = {
    emerald: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    blue: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    purple: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
    zinc: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20',
  };

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 hover:border-zinc-700/50 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg ${colorClasses[color]} flex items-center justify-center border`}>
          <Icon className="w-4 h-4" />
        </div>
        {subtext && (
          <span className="text-xs text-zinc-600 font-mono">{subtext}</span>
        )}
      </div>
      <div className="text-2xl font-bold font-display text-zinc-100">{value}</div>
      <div className="text-xs text-zinc-500 font-mono mt-0.5">{label}</div>
    </div>
  );
}

// Filter Chip
function FilterChip({ active, count, icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
        ${active 
          ? 'bg-zinc-100 text-zinc-900' 
          : 'bg-zinc-900/50 text-zinc-500 hover:text-zinc-300 border border-zinc-800/50 hover:border-zinc-700/50'
        }
      `}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
      {count > 0 && (
        <span className={`ml-1 ${active ? 'text-zinc-600' : 'text-zinc-600'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

export default function HistoryPage() {
  const { user, setShowLogin } = useAuth();
  const [draws, setDraws] = useState([]);
  const [stats, setStats] = useState({ total: 0, merged: 0, active: 0, expired: 0 });
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState({
    today: true,
    week: true,
    month: false,
    older: false,
  });

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, statusFilter]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.get('/draws/history', { params });
      const rawDraws = (res._data || []).map(normalizeDraw);
      setDraws(rawDraws);

      // Calculate stats
      const total = rawDraws.length;
      const merged = rawDraws.filter(d => d.status === 'merged').length;
      const active = rawDraws.filter(d => ['bookmarked', 'pr_submitted'].includes(d.status)).length;
      const expired = rawDraws.filter(d => d.status === 'expired').length;
      setStats({ total, merged, active, expired });
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
    setLoading(false);
  };

  // Group draws by time
  const groupedDraws = useMemo(() => {
    const groups = { today: [], week: [], month: [], older: [] };
    draws.forEach(draw => {
      const group = getTimeGroup(draw.created_at);
      groups[group].push(draw);
    });
    return groups;
  }, [draws]);

  // Filter counts
  const filterCounts = useMemo(() => ({
    all: draws.length,
    merged: draws.filter(d => d.status === 'merged').length,
    active: draws.filter(d => ['bookmarked', 'pr_submitted'].includes(d.status)).length,
    drawn: draws.filter(d => d.status === 'drawn').length,
    expired: draws.filter(d => d.status === 'expired').length,
  }), [draws]);

  const toggleGroup = (group) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  if (!user) {
    return (
      <div className="min-h-screen pt-24 px-6 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 flex items-center justify-center mx-auto mb-6">
            <History className="w-8 h-8 text-zinc-600" />
          </div>
          <h2 className="text-2xl font-bold font-display text-zinc-100 mb-3">
            Your Journey Awaits
          </h2>
          <p className="text-zinc-500 mb-6">
            Sign in to track your contributions, see your progress, and celebrate your merged PRs.
          </p>
          <button 
            onClick={() => setShowLogin(true)}
            className="px-6 py-2.5 bg-zinc-100 text-zinc-900 rounded-lg font-medium hover:bg-white transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-24">
      <div className="max-w-4xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold font-display text-zinc-100 mb-2">
            Your Contribution Journey
          </h1>
          <p className="text-zinc-500">
            Track your progress from first draw to merged PR
          </p>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
        >
          <StatCard
            icon={Target}
            label="Total Draws"
            value={stats.total}
            color="zinc"
          />
          <StatCard
            icon={CheckCircle2}
            label="Merged"
            value={stats.merged}
            subtext={stats.total > 0 ? `${Math.round((stats.merged / stats.total) * 100)}%` : '0%'}
            color="emerald"
          />
          <StatCard
            icon={Clock}
            label="Active"
            value={stats.active}
            color="blue"
          />
          <StatCard
            icon={Trophy}
            label="Success Rate"
            value={stats.total > 0 ? `${Math.round((stats.merged / stats.total) * 100)}%` : '0%'}
            color="purple"
          />
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap gap-2 mb-6"
        >
          <FilterChip
            active={statusFilter === 'all'}
            count={filterCounts.all}
            icon={History}
            label="All"
            onClick={() => setStatusFilter('all')}
          />
          <FilterChip
            active={statusFilter === 'merged'}
            count={filterCounts.merged}
            icon={GitMerge}
            label="Merged"
            onClick={() => setStatusFilter('merged')}
          />
          <FilterChip
            active={statusFilter === 'active'}
            count={filterCounts.active}
            icon={Clock}
            label="Active"
            onClick={() => setStatusFilter('active')}
          />
          <FilterChip
            active={statusFilter === 'drawn'}
            count={filterCounts.drawn}
            icon={Circle}
            label="Drawn"
            onClick={() => setStatusFilter('drawn')}
          />
          <FilterChip
            active={statusFilter === 'expired'}
            count={filterCounts.expired}
            icon={XCircle}
            label="Expired"
            onClick={() => setStatusFilter('expired')}
          />
        </motion.div>

        {/* History List */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-zinc-900/30 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : draws.length === 0 ? (
            <div className="text-center py-16 bg-zinc-900/30 rounded-2xl border border-zinc-800/50 border-dashed">
              <Sparkles className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-zinc-400 mb-2">
                No history yet
              </h3>
              <p className="text-sm text-zinc-600 mb-4">
                Start your journey by drawing your first issue
              </p>
              <a
                href="/discover"
                className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
              >
                <Target className="w-4 h-4" />
                Discover Issues
              </a>
            </div>
          ) : (
            <div>
              {TIME_GROUPS.map((group) => (
                <TimeGroupSection
                  key={group.key}
                  label={group.label}
                  draws={groupedDraws[group.key]}
                  isExpanded={expandedGroups[group.key]}
                  onToggle={() => toggleGroup(group.key)}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
