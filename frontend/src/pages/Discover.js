import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { motion } from 'framer-motion';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import DrawAnimation, { RARITY, DIFF_COLORS, RarityBadge } from '@/components/DrawAnimation';
import InfoSidebar from '@/components/InfoSidebar';
import IssueCardRow from '@/components/IssueCardRow';

const LANGUAGES = ['JavaScript', 'TypeScript', 'Python', 'Rust', 'Go', 'Java', 'Ruby', 'C', 'Dart', 'Elixir'];
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];
const RARITIES = ['common', 'rare', 'epic'];
const EASE = [0.22, 1, 0.36, 1];

function getRarity(issue) {
  return RARITY[issue?.rarity] || RARITY.common;
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
  const { user, setShowLogin, refreshUser } = useAuth();
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
  const [choosingIssueId, setChoosingIssueId] = useState(null);
  const [xpAwarded, setXpAwarded] = useState(null);
  const shuffleRef = useRef([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Sort state
  const [sortField, setSortField] = useState('stars');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    if (user) {
      loadActiveBookmark();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [languages, difficulties, rarities, issueQuery]);

  const loadActiveBookmark = async () => {
    try {
      const res = await api.get('/draws/history', {
        params: { status: 'bookmarked', limit: 1 },
      });
      const draws = res._data || [];
      if (draws.length > 0) {
        setActiveBookmark(normalizeHistoryDraw(draws[0]));
      } else {
        const res2 = await api.get('/draws/history', {
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
      });
      const data = res._data;
      const normalized = normalizeDrawResponse(data);
      const rarity = getRarity(normalized);
      setRedrawsRemaining(data.remaining_draws ?? 2);
      setCurrentDrawId(data.draw.id);
      setXpAwarded(data.xp_awarded || rarity.drawXP);
      setTimeout(() => { setDrawnIssue(normalized); setDrawState('revealed'); }, 1000);
    } catch (err) {
      setDrawState('idle');
      toast.error(err._message || 'Draw failed');
    }
  }, [user, languages, difficulties, setShowLogin]);

  const handleChooseIssue = async (issueId) => {
    if (!user) { setShowLogin(true); return; }
    setChoosingIssueId(issueId);
    try {
      const res = await api.post(
        '/draws/choose',
        { issue_id: issueId },
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
      await api.put(`/draws/${currentDrawId}/status`, { status: 'bookmarked' });
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
      await api.put(`/draws/${activeBookmark.id}/status`, { status: 'expired' });
      setActiveBookmark(null);
      toast.success('Bookmark released');
      await refreshUser();
    } catch (err) { toast.error(err._message || 'Release failed'); }
  };

  const handleSubmitPR = async () => {
    if (!prUrl.trim() || !prDrawId) return;
    try {
      await api.put(`/draws/${prDrawId}/pr`, { pr_url: prUrl });
      toast.success('PR submitted! XP awarded on merge.');
      setShowPRDialog(false);
      setPrUrl('');
      if (activeBookmark?.id === prDrawId) setActiveBookmark(prev => prev ? { ...prev, status: 'pr_submitted', pr_url: prUrl } : null);
    } catch (err) { toast.error(err._message || 'Submit failed'); }
  };

  const handleVerify = async (drawId) => {
    try {
      const res = await api.post(`/draws/${drawId}/verify`, {});
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

  // Filtered issues: text search applied on top of tableData
  const filteredIssues = useMemo(() => {
    let filtered = tableData;
    if (issueQuery) {
      const term = issueQuery.toLowerCase();
      filtered = filtered.filter(issue =>
        `${issue.repo} ${issue.title} ${(issue.labels || []).join(' ')}`.toLowerCase().includes(term)
      );
    }
    // Sort
    filtered = [...filtered].sort((a, b) => {
      const aVal = a[sortField] ?? 0;
      const bVal = b[sortField] ?? 0;
      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return filtered;
  }, [tableData, issueQuery, sortField, sortDir]);

  const totalPages = Math.ceil(filteredIssues.length / pageSize) || 1;
  const paginatedIssues = filteredIssues.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div className="pt-20 pb-16 relative min-h-screen" data-testid="discover-page">
      {/* Enhanced ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none animate-soft-glow" style={{ background: 'radial-gradient(ellipse, rgba(125,211,252,0.06) 0%, rgba(251,191,36,0.04) 40%, transparent 70%)' }} />

      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, ease: EASE }}
          className="mb-12"
        >
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="font-mono text-[10px] text-sky-300/60 uppercase tracking-[0.3em] block mb-4"
          >
            Discover
          </motion.span>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 tracking-tight bg-gradient-to-br from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent" style={{ letterSpacing: '-0.06em' }}>
            Draw your next contribution
          </h1>
          <p className="text-zinc-400 text-base md:text-lg max-w-2xl">
            Find the perfect issue through our gamified draw system or browse the complete collection
          </p>
        </motion.div>

        {/* Hero Draw Area — sidebar + draw animation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
          className="flex gap-8 items-start justify-center mb-20"
        >
          <InfoSidebar
            redrawsRemaining={redrawsRemaining}
            activeBookmark={activeBookmark}
            onSubmitPR={(drawId) => { setPrDrawId(drawId); setShowPRDialog(true); }}
            onVerify={(drawId) => handleVerify(drawId)}
            onRelease={handleRelease}
            getCountdown={getCountdown}
          />
          <div className="flex-1 flex flex-col items-center max-w-2xl">
            <DrawAnimation
              state={drawState}
              issue={drawnIssue}
              onDraw={handleDraw}
              onBookmark={handleBookmark}
              onRedraw={() => { setDrawState('idle'); setDrawnIssue(null); setCurrentDrawId(null); setXpAwarded(null); }}
              xpAwarded={xpAwarded || (drawnIssue ? (RARITY[drawnIssue.rarity || 'common']?.drawXP || 5) : 0)}
              drawSource={drawnIssue?.draw_source || 'draw'}
              redrawsRemaining={redrawsRemaining}
            />
          </div>
        </motion.div>

        {/* Browse Section */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.72, ease: EASE, delay: 0.25 }}
          data-testid="issues-table-section"
        >
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-6">
            <div className="space-y-2">
              <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent" style={{ letterSpacing: '-0.05em' }} data-testid="issues-table-title">
                Browse All Issues
              </h2>
              <p className="text-zinc-400 text-sm max-w-2xl" data-testid="issues-table-subtitle">
                Choose directly for standard XP, or <span className="text-sky-300 font-medium">Draw</span> for triple rewards.
                <span className="text-zinc-500 ml-1">Legendary issues are draw-exclusive.</span>
              </p>
            </div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="relative w-full md:w-[380px]"
            >
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                value={issueQuery}
                onChange={(e) => setIssueQuery(e.target.value)}
                placeholder="Search repos, titles, or labels..."
                className="pl-11 py-2.5 bg-zinc-900/60 border-white/[0.08] rounded-lg hover:border-white/15 focus:border-sky-300/40 transition-colors"
                data-testid="issues-table-search-input"
              />
            </motion.div>
          </div>

          {/* Inline filter chips */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex flex-wrap gap-2 mb-6"
          >
            {/* Language filters */}
            {LANGUAGES.map((lang, idx) => (
              <motion.button
                key={lang}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.02, duration: 0.3 }}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => toggleLang(lang)}
                data-testid={`filter-lang-${lang.toLowerCase()}`}
                className={`px-3.5 py-2 rounded-lg text-xs font-mono border backdrop-blur-sm transition-all duration-200 ${
                  languages.includes(lang)
                    ? 'bg-sky-300/10 border-sky-300/40 text-sky-200 shadow-[0_0_16px_-6px_rgba(125,211,252,0.5)]'
                    : 'bg-zinc-900/40 border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:border-white/15 hover:bg-zinc-900/60'
                }`}
              >
                {lang}
              </motion.button>
            ))}

            <div className="w-px h-6 bg-gradient-to-b from-transparent via-white/10 to-transparent self-center mx-1" />

            {/* Difficulty filters */}
            {DIFFICULTIES.map((diff, idx) => (
              <motion.button
                key={diff}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (LANGUAGES.length + idx) * 0.02, duration: 0.3 }}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => toggleDiff(diff)}
                data-testid={`filter-diff-${diff.toLowerCase()}`}
                className={`px-3.5 py-2 rounded-lg text-xs font-mono border backdrop-blur-sm transition-all duration-200 ${
                  difficulties.includes(diff)
                    ? 'bg-sky-300/10 border-sky-300/40 text-sky-200 shadow-[0_0_16px_-6px_rgba(125,211,252,0.5)]'
                    : 'bg-zinc-900/40 border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:border-white/15 hover:bg-zinc-900/60'
                }`}
              >
                {diff}
              </motion.button>
            ))}

            <div className="w-px h-6 bg-gradient-to-b from-transparent via-white/10 to-transparent self-center mx-1" />

            {/* Rarity filters */}
            {RARITIES.map((r, idx) => {
              const Icon = RARITY[r].icon;
              const rarityData = RARITY[r];
              return (
                <motion.button
                  key={r}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: (LANGUAGES.length + DIFFICULTIES.length + idx) * 0.02, duration: 0.3 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => toggleRarity(r)}
                  data-testid={`filter-rarity-${r}`}
                  className={`px-3.5 py-2 rounded-lg text-xs font-mono border backdrop-blur-sm inline-flex items-center gap-1.5 transition-all duration-200 ${
                    rarities.includes(r)
                      ? `border-${rarityData.color}-300/40 text-${rarityData.color}-200 shadow-[0_0_16px_-6px_${rarityData.accent}0.5)]`
                      : 'bg-zinc-900/40 border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:border-white/15 hover:bg-zinc-900/60'
                  }`}
                  style={rarities.includes(r) ? {
                    background: `${rarityData.accent}0.08)`,
                    borderColor: `${rarityData.accent}0.4)`,
                    color: `${rarityData.accent}0.95)`,
                  } : {}}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  {rarityData.label}
                </motion.button>
              );
            })}
          </motion.div>

          {/* Issue card list */}
          {issuesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="h-24 rounded-xl shimmer"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedIssues.map((issue, idx) => (
                <motion.div
                  key={issue.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03, duration: 0.3 }}
                >
                  <IssueCardRow issue={issue} onChoose={handleChooseIssue} choosingIssueId={choosingIssueId} />
                </motion.div>
              ))}
              {filteredIssues.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-20 px-6"
                >
                  <div className="w-16 h-16 rounded-full bg-zinc-900/60 border border-white/[0.06] flex items-center justify-center mb-4">
                    <Search className="w-7 h-7 text-zinc-600" />
                  </div>
                  <p className="text-zinc-400 font-medium text-base mb-1">No issues found</p>
                  <p className="text-zinc-600 text-sm">Try adjusting your filters or search query</p>
                </motion.div>
              )}
            </div>
          )}

          {/* Pagination */}
          {!issuesLoading && filteredIssues.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4 mt-6">
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-600 font-mono">{filteredIssues.length} issue{filteredIssues.length !== 1 ? 's' : ''}</span>
                <div className="w-px h-3 bg-white/10" />
                <select
                  data-testid="page-size-select"
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                  className="text-xs font-mono bg-zinc-900/60 border border-white/10 text-zinc-400 rounded-md px-2 py-1 outline-none focus:border-amber-400/30"
                >
                  {[10, 25, 50, 100].map(s => <option key={s} value={s}>{s} / page</option>)}
                  )
                  }
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="min-w-[28px] h-7 rounded-md text-xs font-mono text-zinc-500 hover:text-zinc-200 hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="min-w-[28px] h-7 rounded-md text-xs font-mono text-zinc-500 hover:text-zinc-200 hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                {getPageNumbers().map(p => (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`min-w-[28px] h-7 rounded-md text-xs font-mono ${
                      p === currentPage
                        ? 'bg-amber-400/10 border border-amber-400/30 text-amber-200'
                        : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="min-w-[28px] h-7 rounded-md text-xs font-mono text-zinc-500 hover:text-zinc-200 hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="min-w-[28px] h-7 rounded-md text-xs font-mono text-zinc-500 hover:text-zinc-200 hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-zinc-600">Go to</span>
                <input
                  data-testid="page-jump-input"
                  type="number"
                  min={1}
                  max={totalPages}
                  className="w-14 h-7 text-xs font-mono text-center bg-zinc-900/60 border border-white/10 text-zinc-400 rounded-md outline-none focus:border-amber-400/30"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseInt(e.target.value, 10);
                      if (val >= 1 && val <= totalPages) setCurrentPage(val);
                      e.target.value = '';
                    }
                  }}
                />
              </div>
            </div>
          )}
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
