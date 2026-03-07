import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { DataTable, DataTableColumnHeader } from '@/components/ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { Shuffle, Bookmark, ExternalLink, RotateCcw, Star, FolderGit2, Clock, X, Send, CheckCircle2, BookOpen, Zap, Search, Crosshair, Gem, Crown, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const LANGUAGES = ['JavaScript', 'TypeScript', 'Python', 'Rust', 'Go', 'Java', 'Ruby', 'C', 'Dart', 'Elixir'];
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];
const RARITIES = ['common', 'rare', 'epic'];
const DIFF_COLORS = {
  Beginner: 'bg-sky-300/10 text-sky-200 border-sky-300/20',
  Intermediate: 'bg-slate-300/10 text-slate-200 border-slate-300/20',
  Advanced: 'bg-red-500/10 text-red-400 border-red-500/20',
};
const EASE = [0.22, 1, 0.36, 1];

// Rarity config — draw gets 3x, browse gets 1x
const RARITY = {
  common:    { label: 'Common',    browseMergeXP: 25,  drawXP: 5,   drawMergeXP: 75,  icon: null,      color: 'zinc',   glowClass: 'rarity-glow-common' },
  rare:      { label: 'Rare',      browseMergeXP: 50,  drawXP: 15,  drawMergeXP: 150, icon: Gem,       color: 'blue',   glowClass: 'rarity-glow-rare' },
  epic:      { label: 'Epic',      browseMergeXP: 100, drawXP: 30,  drawMergeXP: 300, icon: Sparkles,  color: 'purple', glowClass: 'rarity-glow-epic' },
  legendary: { label: 'Legendary', browseMergeXP: 0,   drawXP: 50,  drawMergeXP: 500, icon: Crown,     color: 'amber',  glowClass: 'rarity-glow-legendary' },
};

function getRarity(issue) {
  return RARITY[issue?.rarity] || RARITY.common;
}

function RarityBadge({ rarity, className = '' }) {
  const r = RARITY[rarity] || RARITY.common;
  const Icon = r.icon;
  return (
    <span className={`rarity-badge rarity-badge-${rarity || 'common'} inline-flex items-center gap-1 ${className}`}>
      {Icon && <Icon className="w-3 h-3" strokeWidth={2} />}
      {r.label}
    </span>
  );
}

// Normalize issue from Go backend shape to flat UI shape
function normalizeIssue(issue) {
  return {
    ...issue,
    repo: `${issue.repo_owner}/${issue.repo_name}`,
    stars: issue.repo_stars,
  };
}

// Normalize draw+issue response from draw/choose endpoints
function normalizeDrawResponse(data) {
  const issue = normalizeIssue(data.issue);
  return {
    ...issue,
    draw_id: data.draw.id,
    draw_status: data.draw.status,
    draw_source: data.draw.source || 'draw',
    expires_at: data.draw.expires_at,
    xp_awarded: data.xp_awarded,
  };
}

// Normalize a history draw row (has nested issue)
function normalizeHistoryDraw(draw) {
  const issue = draw.issue || {};
  return {
    ...draw,
    repo: `${issue.repo_owner || ''}/${issue.repo_name || ''}`,
    title: issue.title || '',
    url: issue.url || '',
    language: issue.language || '',
    difficulty: issue.difficulty || '',
    rarity: issue.rarity || 'common',
    stars: issue.repo_stars,
    labels: issue.labels || [],
  };
}

export default function Discover() {
  const { user, token, setShowLogin, refreshUser } = useAuth();
  const [languages, setLanguages] = useState([]);
  const [difficulties, setDifficulties] = useState([]);
  const [rarities, setRarities] = useState([]);
  const [drawState, setDrawState] = useState('idle');
  const [drawnIssue, setDrawnIssue] = useState(null);
  const [currentDrawId, setCurrentDrawId] = useState(null);
  const [redrawsRemaining, setRedrawsRemaining] = useState(3);
  const [activeBookmark, setActiveBookmark] = useState(null);
  const [showPRDialog, setShowPRDialog] = useState(false);
  const [prUrl, setPrUrl] = useState('');
  const [prDrawId, setPrDrawId] = useState(null);
  const [issues, setIssues] = useState([]);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [issueQuery, setIssueQuery] = useState('');
  const [sorting, setSorting] = useState([{ id: 'stars', desc: true }]);
  const [choosingIssueId, setChoosingIssueId] = useState(null);
  const [xpAwarded, setXpAwarded] = useState(null);
  const shuffleRef = useRef([]);

  useEffect(() => {
    if (token) {
      loadActiveBookmark();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadIdRef = useRef(0);

  useEffect(() => {
    const id = ++loadIdRef.current;
    let cancelled = false;

    const load = async () => {
      setIssuesLoading(true);
      try {
        const params = { limit: 100 };
        if (languages.length === 1) params.language = languages[0];
        if (difficulties.length === 1) params.difficulty = difficulties[0];
        if (rarities.length === 1) params.rarity = rarities[0];

        let all = [];
        let cursor = null;
        do {
          if (cancelled) return;
          if (cursor) params.cursor = cursor;
          const res = await api.get('/issues', { params });
          if (cancelled) return;
          all = all.concat((res._data || []).map(normalizeIssue));
          cursor = res._meta?.has_more ? res._meta.next_cursor : null;
        } while (cursor);

        if (!cancelled) setIssues(all);
      } catch {
        if (!cancelled) setIssues([]);
      }
      if (!cancelled) setIssuesLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [languages, difficulties, rarities]);

  const loadActiveBookmark = async () => {
    try {
      const res = await api.get('/draws/history', {
        headers: { Authorization: `Bearer ${token}` },
        params: { status: 'bookmarked', limit: 1 },
      });
      const draws = res._data || [];
      if (draws.length > 0) {
        setActiveBookmark(normalizeHistoryDraw(draws[0]));
      } else {
        const res2 = await api.get('/draws/history', {
          headers: { Authorization: `Bearer ${token}` },
          params: { status: 'pr_submitted', limit: 1 },
        });
        const draws2 = res2._data || [];
        if (draws2.length > 0) {
          setActiveBookmark(normalizeHistoryDraw(draws2[0]));
        } else {
          setActiveBookmark(null);
        }
      }
    } catch { /* ignore */ }
  };

  const toggleLang = (lang) => setLanguages(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]);
  const toggleDiff = (diff) => setDifficulties(prev => prev.includes(diff) ? prev.filter(d => d !== diff) : [...prev, diff]);
  const toggleRarity = (r) => setRarities(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);

  const handleDraw = useCallback(async () => {
    if (!user) { setShowLogin(true); return; }
    shuffleRef.current = Array.from({ length: 5 }, () => ({
      x: (Math.random() - 0.5) * 280, y: (Math.random() - 0.5) * 140, rotate: (Math.random() - 0.5) * 60,
    }));
    setDrawState('shuffling');
    setDrawnIssue(null);
    setCurrentDrawId(null);
    setXpAwarded(null);
    try {
      const res = await api.post('/draws/', {
        language: languages[0] || undefined,
        difficulty: difficulties[0] || undefined,
      }, { headers: { Authorization: `Bearer ${token}` } });
      const data = res._data;
      const normalized = normalizeDrawResponse(data);
      const rarity = getRarity(normalized);
      setRedrawsRemaining(data.remaining_draws ?? 2);
      setCurrentDrawId(data.draw.id);
      setXpAwarded(data.xp_awarded || rarity.drawXP);
      setTimeout(() => { setDrawnIssue(normalized); setDrawState('revealed'); }, 1800);
    } catch (err) {
      setDrawState('idle');
      toast.error(err._message || 'Draw failed');
    }
  }, [user, token, languages, difficulties, setShowLogin]);

  const handleChooseIssue = async (issueId) => {
    if (!user) { setShowLogin(true); return; }
    setChoosingIssueId(issueId);
    try {
      const res = await api.post(
        '/draws/choose',
        { issue_id: issueId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = res._data;
      const normalized = normalizeDrawResponse(data);
      setDrawnIssue(normalized);
      setCurrentDrawId(data.draw.id);
      setXpAwarded(0);
      setDrawState('revealed');
      toast.success('Issue selected! XP awarded on merge.');
      await refreshUser();
    } catch (err) {
      toast.error(err._message || 'Choose issue failed');
    }
    setChoosingIssueId(null);
  };

  const handleBookmark = async () => {
    if (!currentDrawId) return;
    try {
      await api.put(`/draws/${currentDrawId}/status`, { status: 'bookmarked' }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Issue bookmarked! You have 7 days.');
      await refreshUser();
      await loadActiveBookmark();
      setDrawState('idle');
      setDrawnIssue(null);
      setCurrentDrawId(null);
      setXpAwarded(null);
    } catch (err) { toast.error(err._message || 'Bookmark failed'); }
  };

  const handleRelease = async () => {
    if (!activeBookmark) return;
    try {
      await api.put(`/draws/${activeBookmark.id}/status`, { status: 'expired' }, { headers: { Authorization: `Bearer ${token}` } });
      setActiveBookmark(null);
      toast.success('Bookmark released');
      await refreshUser();
    } catch (err) { toast.error(err._message || 'Release failed'); }
  };

  const handleSubmitPR = async () => {
    if (!prUrl.trim() || !prDrawId) return;
    try {
      await api.put(`/draws/${prDrawId}/pr`, { pr_url: prUrl }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('PR submitted! XP awarded on merge.');
      setShowPRDialog(false);
      setPrUrl('');
      if (activeBookmark?.id === prDrawId) setActiveBookmark(prev => prev ? { ...prev, status: 'pr_submitted', pr_url: prUrl } : null);
    } catch (err) { toast.error(err._message || 'Submit failed'); }
  };

  const handleVerify = async (drawId) => {
    try {
      const res = await api.post(`/draws/${drawId}/verify`, {}, { headers: { Authorization: `Bearer ${token}` } });
      const data = res._data;
      toast.success(`PR merged! ${data.new_badges?.length ? '+ New badge!' : ''}`);
      setActiveBookmark(null);
      await refreshUser();
    } catch (err) { toast.error(err._message || 'Verification failed'); }
  };

  const getCountdown = (expiresAt) => {
    if (!expiresAt) return '';
    const diff = new Date(expiresAt) - Date.now();
    if (diff <= 0) return 'Expired';
    return `${Math.floor(diff / 86400000)}d ${Math.floor((diff % 86400000) / 3600000)}h`;
  };

  // Client-side filtering for multi-select + text (server handles single-value filters).
  const tableData = useMemo(() => {
    return issues.filter((issue) => {
      const byLang = languages.length <= 1 || languages.includes(issue.language);
      const byDiff = difficulties.length <= 1 || difficulties.includes(issue.difficulty);
      const byRarity = rarities.length <= 1 || rarities.includes(issue.rarity);
      return byLang && byDiff && byRarity;
    });
  }, [issues, languages, difficulties, rarities]);

  const globalFilterFn = useCallback((row, _columnId, filterValue) => {
    const term = filterValue.toLowerCase();
    const issue = row.original;
    return `${issue.repo} ${issue.title} ${(issue.labels || []).join(' ')}`.toLowerCase().includes(term);
  }, []);

  const issueColumns = useMemo(() => [
    {
      accessorKey: 'repo',
      header: ({ column }) => <DataTableColumnHeader column={column} label="Repo" />,
      cell: ({ getValue }) => <span className="text-xs text-zinc-400 font-mono truncate block max-w-[160px]">{getValue()}</span>,
    },
    {
      accessorKey: 'title',
      header: ({ column }) => <DataTableColumnHeader column={column} label="Topic" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-sm text-zinc-200 leading-snug line-clamp-2">{row.original.title}</p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {(row.original.labels || []).slice(0, 2).map((label) => (
              <span key={label} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 text-zinc-500 font-mono truncate max-w-[120px]">{label}</span>
            ))}
          </div>
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'rarity',
      header: ({ column }) => <DataTableColumnHeader column={column} label="Rarity" />,
      cell: ({ getValue }) => <RarityBadge rarity={getValue()} />,
      sortingFn: (a, b) => {
        const order = { common: 0, rare: 1, epic: 2, legendary: 3 };
        return (order[a.original.rarity] || 0) - (order[b.original.rarity] || 0);
      },
      size: 100,
    },
    {
      accessorKey: 'language',
      header: ({ column }) => <DataTableColumnHeader column={column} label="Language" />,
      cell: ({ getValue }) => <span className="text-xs text-sky-100 font-mono">{getValue()}</span>,
      size: 110,
    },
    {
      accessorKey: 'difficulty',
      header: ({ column }) => <DataTableColumnHeader column={column} label="Difficulty" />,
      cell: ({ getValue }) => {
        const diff = getValue();
        return <Badge variant="outline" className={`text-xs ${DIFF_COLORS[diff] || ''}`}>{diff}</Badge>;
      },
      sortingFn: (a, b) => {
        const order = { Beginner: 0, Intermediate: 1, Advanced: 2 };
        return (order[a.original.difficulty] || 0) - (order[b.original.difficulty] || 0);
      },
      size: 110,
    },
    {
      accessorKey: 'stars',
      header: ({ column }) => <DataTableColumnHeader column={column} label="Stars" className="justify-end" />,
      cell: ({ getValue }) => (
        <span className="text-xs text-zinc-400 font-mono flex items-center gap-1 justify-end">
          <Star className="w-3 h-3 text-sky-300/50" strokeWidth={1.5} />
          {getValue()?.toLocaleString()}
        </span>
      ),
      size: 90,
    },
    {
      id: 'actions',
      header: () => <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">Actions</span>,
      cell: ({ row }) => {
        const issue = row.original;
        return (
          <div className="inline-flex gap-2 justify-end w-full">
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-md border border-white/10 text-zinc-300 hover:text-white hover:border-white/20 text-xs font-mono inline-flex items-center transition-colors"
            >
              <ExternalLink className="w-3 h-3 mr-1" />View
            </a>
            <button
              onClick={() => handleChooseIssue(issue.id)}
              className="rune-btn px-3 py-1.5 rounded-md text-[11px]"
              disabled={choosingIssueId === issue.id}
            >
              <Crosshair className="w-3 h-3 inline mr-1" />
              {choosingIssueId === issue.id ? 'Choosing...' : 'Choose'}
            </button>
          </div>
        );
      },
      enableSorting: false,
      size: 180,
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [choosingIssueId]);

  const drawnRarity = drawnIssue ? (drawnIssue.rarity || 'common') : 'common';
  const drawnRarityConfig = RARITY[drawnRarity] || RARITY.common;

  return (
    <div className="pt-20 pb-16 relative" data-testid="discover-page">
      {/* Ambient glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none animate-soft-glow" style={{ background: 'radial-gradient(ellipse, rgba(125,211,252,0.1) 0%, transparent 70%)' }} />

      <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, ease: EASE }}>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-2 tracking-tight">
            <span className="text-sky-200 font-mono text-xl">//</span> Discover
          </h1>
          <p className="text-zinc-300 text-base md:text-lg mb-8">Draw your next contribution from the archive.</p>
        </motion.div>

        {/* Signal Cards */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.06 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6"
          data-testid="discover-signal-grid"
        >
          <div className="obsidian rounded-lg px-4 py-3" data-testid="discover-signal-draw-budget">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">Draw Budget</p>
            <p className="text-lg font-semibold text-sky-100 mt-1">{redrawsRemaining} draws left today</p>
          </div>
          <div className="obsidian rounded-lg px-4 py-3" data-testid="discover-signal-bookmark-slot">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">Bookmark Slot</p>
            <p className="text-lg font-semibold text-zinc-100 mt-1">{activeBookmark ? 'Occupied' : 'Open'}</p>
          </div>
          <div className="obsidian rounded-lg px-4 py-3" data-testid="discover-signal-rarity-rewards">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">Draw Rewards</p>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-[10px] font-mono text-zinc-500">+5</span>
              <span className="text-[10px] font-mono text-blue-400">+15</span>
              <span className="text-[10px] font-mono text-purple-400">+30</span>
              <span className="text-[10px] font-mono text-amber-400">+50 XP</span>
            </div>
          </div>
        </motion.div>

        {/* Active Bookmark */}
        {activeBookmark && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, ease: EASE }} className="mb-8" data-testid="active-bookmark">
            <div className={`obsidian inner-glow rounded-xl p-5 rarity-card-${activeBookmark.rarity || 'common'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-sky-200 fill-sky-200" />
                  <span className="font-mono text-xs text-sky-200 uppercase tracking-wider">Active Bookmark</span>
                  <RarityBadge rarity={activeBookmark.rarity} />
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
                  <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {getCountdown(activeBookmark.expires_at)}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                <FolderGit2 className="w-3.5 h-3.5" strokeWidth={1.5} />{activeBookmark.repo}
              </div>
              <p className="font-medium text-sm text-zinc-200 mb-3">{activeBookmark.title}</p>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs px-2 py-0.5 rounded bg-sky-300/10 text-sky-100 border border-sky-300/25 font-mono">{activeBookmark.language}</span>
                <Badge variant="outline" className={`text-xs ${DIFF_COLORS[activeBookmark.difficulty] || ''}`}>{activeBookmark.difficulty}</Badge>
              </div>
              <div className="flex gap-2 flex-wrap">
                {activeBookmark.status === 'bookmarked' && (
                  <button className="rune-btn px-4 py-2 rounded-md" data-testid="submit-pr-button"
                    onClick={() => { setPrDrawId(activeBookmark.id); setShowPRDialog(true); }}>
                    <Send className="w-3.5 h-3.5 inline mr-1.5" />Submit PR
                  </button>
                )}
                {activeBookmark.status === 'pr_submitted' && (
                  <button className="px-4 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono uppercase tracking-wider shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_-5px_rgba(16,185,129,0.5)] hover:bg-emerald-500/20" style={{ transition: 'background-color 0.2s, box-shadow 0.2s' }} data-testid="verify-pr-button"
                    onClick={() => handleVerify(activeBookmark.id)}>
                    <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5" />Verify Merge
                  </button>
                )}
                <a href={activeBookmark.url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-md text-zinc-400 hover:text-white text-xs font-mono uppercase tracking-wider hover:bg-white/5 border border-white/5 hover:border-white/10 inline-flex items-center" style={{ transition: 'color 0.2s, background-color 0.2s, border-color 0.2s' }} data-testid="bookmark-github-link">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />GitHub
                </a>
                <button className="px-4 py-2 rounded-md text-zinc-600 hover:text-red-400 text-xs font-mono uppercase tracking-wider hover:bg-red-500/5" style={{ transition: 'color 0.2s, background-color 0.2s' }} onClick={handleRelease} data-testid="release-bookmark-button">
                  <X className="w-3.5 h-3.5 inline mr-1" />Release
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Filters */}
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.78, ease: EASE, delay: 0.1 }} className="obsidian rounded-xl p-6 mb-10" data-testid="filter-section">
          <div className="mb-5">
            <p className="font-mono text-xs text-zinc-500 uppercase tracking-wider mb-3">Languages</p>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map(lang => (
                <button key={lang} onClick={() => toggleLang(lang)} data-testid={`filter-lang-${lang.toLowerCase()}`}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono border ${
                    languages.includes(lang) ? 'bg-sky-300/12 border-sky-300/35 text-sky-100 shadow-[0_0_12px_-6px_rgba(125,211,252,0.8)]' : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10'
                  }`} style={{ transition: 'color 0.15s, border-color 0.15s, background-color 0.15s, box-shadow 0.15s' }}>
                  {lang}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="font-mono text-xs text-zinc-500 uppercase tracking-wider mb-3">Difficulty</p>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map(diff => (
                <button key={diff} onClick={() => toggleDiff(diff)} data-testid={`filter-diff-${diff.toLowerCase()}`}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono border ${
                    difficulties.includes(diff) ? 'bg-sky-300/12 border-sky-300/35 text-sky-100 shadow-[0_0_12px_-6px_rgba(125,211,252,0.8)]' : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10'
                  }`} style={{ transition: 'color 0.15s, border-color 0.15s, background-color 0.15s, box-shadow 0.15s' }}>
                  {diff}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5">
            <p className="font-mono text-xs text-zinc-500 uppercase tracking-wider mb-3">Rarity</p>
            <div className="flex flex-wrap gap-2">
              {RARITIES.map(r => {
                const Icon = RARITY[r].icon;
                return (
                  <button key={r} onClick={() => toggleRarity(r)} data-testid={`filter-rarity-${r}`}
                    className={`px-3 py-1.5 rounded-md text-xs font-mono border inline-flex items-center gap-1.5 ${
                      rarities.includes(r) ? 'bg-sky-300/12 border-sky-300/35 text-sky-100 shadow-[0_0_12px_-6px_rgba(125,211,252,0.8)]' : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10'
                    }`} style={{ transition: 'color 0.15s, border-color 0.15s, background-color 0.15s, box-shadow 0.15s' }}>
                    {Icon && <Icon className="w-3 h-3" />}
                    {RARITY[r].label}
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Card Draw Area */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, ease: EASE, delay: 0.15 }} className="flex flex-col items-center mb-12" data-testid="card-draw-area">
          {/* Ambient glow ring — changes color with rarity on reveal */}
          <div className="relative">
            <div
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full pointer-events-none ${
                drawState === 'revealed' && drawnIssue ? drawnRarityConfig.glowClass : ''
              }`}
              style={
                drawState === 'shuffling'
                  ? { background: 'radial-gradient(circle, rgba(125,211,252,0.2), transparent 70%)', filter: 'blur(30px)', transition: 'background 0.5s' }
                  : drawState !== 'revealed'
                  ? { background: 'radial-gradient(circle, rgba(125,211,252,0.08), transparent 70%)', filter: 'blur(30px)', transition: 'background 0.5s' }
                  : undefined
              }
            />

            <div className="relative w-72 h-96 mb-8 animate-card-breathe">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className={`absolute inset-0 obsidian rounded-xl flex items-center justify-center cursor-default overflow-hidden ${
                    drawState === 'revealed' && i === 0 && drawnIssue ? `rarity-card-${drawnRarity}` : ''
                  }`}
                  style={{ zIndex: 5 - i }}
                  animate={
                    drawState === 'shuffling' ? {
                      x: shuffleRef.current[i]?.x || 0,
                      y: shuffleRef.current[i]?.y || 0,
                      rotate: shuffleRef.current[i]?.rotate || 0,
                      opacity: 0.5,
                    } : drawState === 'revealed' && i === 0 ? {
                      x: 0, y: 0, rotate: 0, scale: 1.02, opacity: 1,
                    } : {
                      x: i * 3, y: -i * 4, rotate: (i - 2) * 2.5, scale: 1 - i * 0.015, opacity: 1 - i * 0.15,
                    }
                  }
                  transition={drawState === 'shuffling'
                    ? { type: 'spring', stiffness: 105, damping: 18, mass: 1 }
                    : { type: 'spring', stiffness: 120, damping: 22, mass: 0.95 }}
                >
                  {/* Inner glow line — rarity colored on reveal */}
                  <div className={`absolute top-0 left-0 right-0 h-px ${
                    drawState === 'revealed' && i === 0 && drawnIssue
                      ? `rarity-line-${drawnRarity}`
                      : 'bg-gradient-to-r from-transparent via-sky-300/35 to-transparent'
                  }`} />

                  {drawState === 'revealed' && i === 0 && drawnIssue ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="p-6 w-full h-full flex flex-col">
                      {/* Rarity header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
                          <FolderGit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          <span className="truncate">{drawnIssue.repo}</span>
                        </div>
                        <RarityBadge rarity={drawnRarity} />
                      </div>

                      <h3 className="font-semibold text-lg leading-snug mb-auto text-zinc-100">{drawnIssue.title}</h3>

                      <div className="space-y-3 mt-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded bg-sky-300/10 text-sky-100 border border-sky-300/20 font-mono">{drawnIssue.language}</span>
                          <Badge variant="outline" className={`text-xs ${DIFF_COLORS[drawnIssue.difficulty] || ''}`}>{drawnIssue.difficulty}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-500 font-mono">
                          <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-sky-300/70" strokeWidth={1.5} />{drawnIssue.stars?.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {drawnIssue.labels?.slice(0, 3).map(l => <span key={l} className="text-xs px-2 py-0.5 rounded bg-zinc-900 text-zinc-500 border border-white/5 font-mono">{l}</span>)}
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="text-center">
                      <BookOpen className="w-10 h-10 text-sky-300/25 mx-auto mb-3" strokeWidth={1} />
                      <p className="text-sm text-sky-100/35" style={{ fontFamily: 'Satoshi, sans-serif' }}>GitFable</p>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Draw / Action Buttons */}
          <AnimatePresence mode="wait">
            {drawState === 'idle' && (
              <motion.div key="draw" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.55, ease: EASE }} className="flex flex-col items-center gap-4">
                <button onClick={handleDraw} className="rune-btn px-10 py-3.5 rounded-lg animate-pulse-glow" data-testid="draw-button">
                  <Shuffle className="w-4 h-4 inline mr-2" />Draw Issue
                </button>
                <div className="flex flex-col items-center gap-2 text-xs font-mono" data-testid="draw-reward-note">
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-500">Common <span className="text-zinc-400">+5</span></span>
                    <span className="text-blue-400/70">Rare <span className="text-blue-400">+15</span></span>
                    <span className="text-purple-400/70">Epic <span className="text-purple-400">+30</span></span>
                    <span className="text-amber-400/70">Legendary <span className="text-amber-400">+50</span></span>
                  </div>
                  <span className="flex items-center gap-2 text-zinc-600">
                    <Zap className="w-3 h-3 text-sky-300/45" />
                    {redrawsRemaining} draws remaining today
                  </span>
                </div>
              </motion.div>
            )}
            {drawState === 'shuffling' && (
              <motion.div key="shuffling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }} className="text-center">
                <p className="font-mono text-xs text-sky-200 uppercase tracking-widest animate-pulse">Shuffling the archive...</p>
              </motion.div>
            )}
            {drawState === 'revealed' && drawnIssue && (
              <motion.div key="actions" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: EASE }} className="flex flex-col items-center gap-4">
                {/* XP toast banner */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className={`rarity-badge rarity-badge-${drawnRarity} px-4 py-1.5 text-xs flex items-center gap-2`}
                >
                  {drawnRarityConfig.icon && <drawnRarityConfig.icon className="w-3.5 h-3.5" />}
                  <span>{drawnRarityConfig.label} {drawnIssue?.draw_source === 'choose' ? 'Choose' : 'Draw'}</span>
                  <span className="opacity-60">|</span>
                  <span>+{xpAwarded || drawnRarityConfig.drawXP} XP</span>
                  <span className="opacity-60">|</span>
                  <span>Merge: +{drawnIssue?.draw_source === 'choose' ? drawnRarityConfig.browseMergeXP : drawnRarityConfig.drawMergeXP} XP</span>
                </motion.div>

                <div className="flex flex-wrap gap-3 justify-center">
                  <button onClick={handleBookmark} className="rune-btn px-6 py-2.5 rounded-md" data-testid="bookmark-button">
                    <Bookmark className="w-3.5 h-3.5 inline mr-1.5" />Bookmark
                  </button>
                  <button className="px-6 py-2.5 text-zinc-400 hover:text-white font-mono text-xs uppercase tracking-widest hover:bg-white/5 rounded-md border border-white/5 hover:border-white/10" style={{ transition: 'color 0.2s, background-color 0.2s, border-color 0.2s' }} onClick={() => { setDrawState('idle'); setDrawnIssue(null); setCurrentDrawId(null); setXpAwarded(null); }} data-testid="redraw-button">
                    <RotateCcw className="w-3.5 h-3.5 inline mr-1.5" />Redraw
                  </button>
                  <a href={drawnIssue.url} target="_blank" rel="noopener noreferrer" className="px-6 py-2.5 text-zinc-400 hover:text-white font-mono text-xs uppercase tracking-widest hover:bg-white/5 rounded-md border border-white/5 hover:border-white/10 inline-flex items-center" style={{ transition: 'color 0.2s, background-color 0.2s, border-color 0.2s' }} data-testid="view-github-button">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />GitHub
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Issues Table */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.72, ease: EASE, delay: 0.2 }}
          className="obsidian rounded-xl p-5 md:p-6"
          data-testid="issues-table-section"
        >
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl md:text-2xl font-semibold tracking-tight" data-testid="issues-table-title">
                Browse Issues
              </h2>
              <p className="text-zinc-400 text-sm" data-testid="issues-table-subtitle">
                Choose directly — XP on merge. Or <span className="text-sky-300">Draw</span> for 3× rarity-scaled rewards.
                <span className="text-amber-400/60 ml-1">Legendary issues are draw-exclusive.</span>
              </p>
            </div>
            <div className="relative w-full md:w-[340px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                value={issueQuery}
                onChange={(e) => setIssueQuery(e.target.value)}
                placeholder="Search by repo, title, or label..."
                className="pl-10 bg-zinc-900/60 border-white/10"
                data-testid="issues-table-search-input"
              />
            </div>
          </div>

          <DataTable
            columns={issueColumns}
            data={tableData}
            sorting={sorting}
            onSortingChange={setSorting}
            globalFilter={issueQuery}
            onGlobalFilterChange={setIssueQuery}
            globalFilterFn={globalFilterFn}
            pageSize={25}
            isLoading={issuesLoading}
            emptyMessage="No issues match your filters."
          />
        </motion.section>
      </div>

      {/* PR Dialog */}
      <Dialog open={showPRDialog} onOpenChange={setShowPRDialog}>
        <DialogContent className="bg-zinc-950 border-white/10" data-testid="pr-dialog" aria-describedby="pr-dialog-description">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Submit Pull Request</DialogTitle>
            <DialogDescription id="pr-dialog-description" className="text-zinc-500 text-sm">
              Paste your pull request URL to track and verify merge progress.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Input placeholder="https://github.com/.../pull/123" value={prUrl} onChange={e => setPrUrl(e.target.value)}
              className="bg-zinc-900 border-white/10 font-mono text-sm" data-testid="pr-url-input" />
            <button onClick={handleSubmitPR} className="rune-btn w-full py-3 rounded-lg text-center" data-testid="pr-submit-confirm">
              Submit PR
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
