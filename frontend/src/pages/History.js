import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { FolderGit2, ExternalLink, Star, ArrowUpRight } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUSES = ['all', 'drawn', 'bookmarked', 'pr_submitted', 'merged', 'expired'];
const STATUS_STYLES = {
  drawn: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  bookmarked: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  pr_submitted: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  merged: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  expired: 'bg-red-500/10 text-red-400 border-red-500/20',
};
const STATUS_LABELS = {
  drawn: 'Drawn', bookmarked: 'Bookmarked', pr_submitted: 'PR Submitted',
  merged: 'Merged', expired: 'Expired',
};

export default function History() {
  const { user, token, setShowLogin } = useAuth();
  const [draws, setDraws] = useState([]);
  const [stats, setStats] = useState({ total_draws: 0, bookmark_rate: 0, merge_rate: 0 });
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setShowLogin(true); return; }
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, statusFilter, setShowLogin]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await axios.get(`${API}/draws/history${params}`, { headers: { Authorization: `Bearer ${token}` } });
      setDraws(res.data.draws || []);
      setStats(res.data.stats || {});
    } catch { /* ignore */ }
    setLoading(false);
  };

  if (!user) return null;

  return (
    <div className="pt-20 pb-16 px-4 md:px-8 lg:px-12 max-w-5xl mx-auto" data-testid="history-page">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">History</h1>
        <p className="text-muted-foreground text-base md:text-lg mb-8">Your complete contribution ledger.</p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8" data-testid="history-stats">
          {[
            { label: 'Total Draws', value: stats.total_draws },
            { label: 'Bookmark Rate', value: `${stats.bookmark_rate}%` },
            { label: 'Merge Rate', value: `${stats.merge_rate}%` },
          ].map(s => (
            <Card key={s.label} className="border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold font-mono">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-8" data-testid="history-filters">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              data-testid={`filter-status-${s}`}
              className={`px-3 py-1.5 rounded-md text-sm border font-medium capitalize ${
                statusFilter === s ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground'
              }`}
              style={{ transition: 'color 0.15s, border-color 0.15s, background-color 0.15s' }}
            >
              {s === 'all' ? 'All' : STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl shimmer" />)}</div>
        ) : draws.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No history yet. Visit Discover to draw your first issue!</p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="history-list">
            {draws.map((draw, i) => (
              <motion.div
                key={draw.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card className="border-border/30 hover:border-border/60" style={{ transition: 'border-color 0.2s' }}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          <FolderGit2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{draw.repo}</span>
                          <span className="shrink-0">{new Date(draw.drawn_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm font-medium mb-2 line-clamp-1">{draw.title}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-xs">{draw.language}</Badge>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Star className="w-3 h-3 text-amber-500" />{draw.stars?.toLocaleString()}
                          </span>
                          {draw.pr_url && (
                            <a href={draw.pr_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1" data-testid={`pr-link-${draw.id}`}>
                              PR <ArrowUpRight className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={`text-xs border ${STATUS_STYLES[draw.status] || ''}`} data-testid={`status-${draw.id}`}>
                          {STATUS_LABELS[draw.status] || draw.status}
                        </Badge>
                        <a href={draw.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" data-testid={`github-link-${draw.id}`}>
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
