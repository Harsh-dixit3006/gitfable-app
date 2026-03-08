import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { FolderGit2, ExternalLink, Star, ArrowUpRight, BarChart3, Bookmark, GitMerge } from 'lucide-react';
import { api } from '@/lib/api';

const STATUSES = ['all', 'drawn', 'bookmarked', 'pr_submitted', 'merged', 'expired'];
const STATUS_LABELS = { drawn: 'Drawn', bookmarked: 'Bookmarked', pr_submitted: 'PR Submitted', merged: 'Merged', expired: 'Expired' };

// Normalize draw row from Go backend (has nested issue object)
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
    title: issue.title || '',
    url: issue.url || '',
    language: issue.language || '',
    difficulty: issue.difficulty || '',
    stars: issue.repo_stars,
    labels: issue.labels || [],
  };
}

export default function History() {
  const { user, setShowLogin } = useAuth();
  const [draws, setDraws] = useState([]);
  const [stats, setStats] = useState({ total_draws: 0, bookmark_rate: 0, merge_rate: 0 });
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, statusFilter]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = { limit: 50 };
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.get('/draws/history', { params });
      const rawDraws = (res._data || []).map(normalizeDraw);
      setDraws(rawDraws);

      // Compute stats from all draws (fetch without status filter)
      if (statusFilter === 'all' && rawDraws.length > 0) {
        const total = rawDraws.length;
        const bookmarked = rawDraws.filter(d => ['bookmarked', 'pr_submitted', 'merged'].includes(d.status)).length;
        const merged = rawDraws.filter(d => d.status === 'merged').length;
        setStats({
          total_draws: total,
          bookmark_rate: total > 0 ? Math.round((bookmarked / total) * 100) : 0,
          merge_rate: total > 0 ? Math.round((merged / total) * 100) : 0,
        });
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  if (!user) return (
    <div className="pt-20 px-6 sm:px-8 lg:px-12 max-w-4xl mx-auto text-center" data-testid="history-login-prompt">
      <div className="py-20">
        <h2 className="text-2xl font-bold font-display mb-4" style={{ letterSpacing: '-0.04em' }}>Sign in to view your history</h2>
        <p className="text-zinc-400 mb-6">Track all your drawn issues and contributions.</p>
        <button onClick={() => setShowLogin(true)} className="rune-btn px-8 py-3 rounded-lg" data-testid="history-sign-in">Sign In</button>
      </div>
    </div>
  );

  return (
    <div className="pt-20 pb-16 relative" data-testid="history-page">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <span className="font-mono text-[10px] text-amber-400/60 uppercase tracking-[0.3em] block mb-4">History</span>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold mb-3 tracking-tight" style={{ letterSpacing: '-0.06em' }}>
            Your contribution ledger.
          </h1>
          <p className="text-zinc-500 text-base md:text-lg mb-8">Every issue drawn, every PR merged.</p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8" data-testid="history-stats">
            {[
              { label: 'Total Draws', value: stats.total_draws, icon: BarChart3, color: 'text-amber-300', border: 'border-amber-400/20' },
              { label: 'Bookmark Rate', value: `${stats.bookmark_rate}%`, icon: Bookmark, color: 'text-amber-400/60', border: 'border-white/10' },
              { label: 'Merge Rate', value: `${stats.merge_rate}%`, icon: GitMerge, color: 'text-amber-400/60', border: 'border-white/10' },
            ].map(s => (
              <div key={s.label} className={`obsidian rounded-xl p-5 ${s.border}`}>
                <s.icon className={`w-4 h-4 ${s.color} mb-2`} strokeWidth={1.5} />
                <p className="text-2xl font-bold font-mono text-zinc-100">{s.value}</p>
                <p className="text-xs text-zinc-600 font-mono mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-8" data-testid="history-filters">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                data-testid={`filter-status-${s}`}
                className={`px-3 py-1.5 rounded-md text-xs font-mono border capitalize ${
                  statusFilter === s
                    ? 'bg-amber-400/10 border-amber-400/30 text-amber-200 shadow-[0_0_12px_-6px_rgba(251,191,36,0.6)]'
                    : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10'
                }`}
                style={{ transition: 'color 0.15s, border-color 0.15s, background-color 0.15s, box-shadow 0.15s' }}
              >
                {s === 'all' ? 'All' : STATUS_LABELS[s] || s}
              </button>
            ))}
          </div>

          {/* List */}
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl shimmer" />)}</div>
          ) : draws.length === 0 ? (
            <div className="text-center py-16 obsidian rounded-xl">
              <p className="text-zinc-600 font-mono text-sm">No history yet. Visit Discover to draw your first issue!</p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="history-list">
              {draws.map((draw, i) => (
                <motion.div
                  key={draw.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  whileHover={{ scale: 1.005 }}
                  className="obsidian rounded-xl p-4 hover:border-white/[0.12] cursor-default"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-zinc-600 font-mono mb-1">
                        <FolderGit2 className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                        <span className="truncate">{draw.repo}</span>
                        <span className="shrink-0 text-zinc-600">{draw.created_at ? new Date(draw.created_at).toLocaleDateString() : ''}</span>
                      </div>
                      <p className="text-sm font-medium text-zinc-300 mb-2 line-clamp-1">{draw.title}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-400/8 text-amber-200 border border-amber-400/20 font-mono">{draw.language}</span>
                        <span className="flex items-center gap-1 text-xs text-zinc-600 font-mono">
                          <Star className="w-3 h-3 text-amber-400/50" strokeWidth={1.5} />{draw.stars?.toLocaleString()}
                        </span>
                        {draw.pr_url && (
                          <a href={draw.pr_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-mono" data-testid={`pr-link-${draw.id}`}>
                            PR <ArrowUpRight className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2.5 py-1 rounded-md font-mono status-${draw.status}`} data-testid={`status-${draw.id}`}>
                        {STATUS_LABELS[draw.status] || draw.status}
                      </span>
                      <a href={draw.url} target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-300" style={{ transition: 'color 0.2s' }} data-testid={`github-link-${draw.id}`}>
                        <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
                      </a>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
