import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, X, Sparkles, Shuffle } from 'lucide-react';
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

// Filter chip component
function FilterChip({ label, active, onClick, icon: Icon, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`
        filter-chip flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border
        ${active 
          ? 'filter-chip-active' 
          : 'bg-zinc-900/60 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/80'
        }
      `}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </button>
  );
}

// Filter section component
function FilterSection({ title, children }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-600 whitespace-nowrap">{title}</span>
      <div className="w-px h-4 bg-zinc-800" />
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
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
  const [showFilters, setShowFilters] = useState(true);
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

  const clearAllFilters = () => {
    setLanguages([]);
    setDifficulties([]);
    setRarities([]);
    setIssueQuery('');
  };

  const activeFilterCount = languages.length + difficulties.length + rarities.length + (issueQuery ? 1 : 0);

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
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute top-0 left-1/4 w-[600px] h-[400px] animate-soft-glow" 
          style={{ background: 'radial-gradient(ellipse, rgba(14,165,233,0.06) 0%, transparent 70%)' }} 
        />
        <div 
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[350px] animate-soft-glow" 
          style={{ 
            background: 'radial-gradient(ellipse, rgba(168,85,247,0.04) 0%, transparent 70%)',
            animationDelay: '2s'
          }} 
        />
      </div>

      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative">
        {/* Page Header */}
        <motion.header 
          initial={{ opacity: 0, y: 24 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.6, ease: EASE }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="font-mono text-[10px] text-sky-400/70 uppercase tracking-[0.3em]">Discover</span>
            <div className="h-px flex-1 bg-gradient-to-r from-sky-500/20 to-transparent" />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold mb-3 tracking-tight text-white">
            Draw your next contribution.
          </h1>
          <p className="text-zinc-400 text-base md:text-lg max-w-xl">
            Discover open source issues matched to your skills. Draw for bonus XP or browse to choose directly.
          </p>
        </motion.header>

        {/* Hero Draw Area — sidebar + draw animation */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
          className="flex flex-col lg:flex-row gap-6 items-start justify-center mb-20"
        >
          <InfoSidebar
            redrawsRemaining={redrawsRemaining}
            activeBookmark={activeBookmark}
            onSubmitPR={(drawId) => { setPrDrawId(drawId); setShowPRDialog(true); }}
            onVerify={(drawId) => handleVerify(drawId)}
            onRelease={handleRelease}
            getCountdown={getCountdown}
          />
          <div className="flex-1 flex flex-col items-center">
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
        </motion.section>

        {/* Browse Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
          data-testid="issues-table-section"
        >
          {/* Section header */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-sky-400/60" />
                <h2 
                  className="font-display text-xl md:text-2xl font-bold tracking-tight text-white" 
                  data-testid="issues-table-title"
                >
                  Browse Issues
                </h2>
              </div>
              <p className="text-zinc-500 text-sm" data-testid="issues-table-subtitle">
                Choose directly for XP on merge, or{' '}
                <span className="text-sky-400 font-medium">Draw</span> for 3x rarity-scaled rewards.
                <span className="text-amber-400/70 ml-1">Legendary issues are draw-exclusive.</span>
              </p>
            </div>

            {/* Search input */}
            <div className="relative w-full md:w-[340px]">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                value={issueQuery}
                onChange={(e) => setIssueQuery(e.target.value)}
                placeholder="Search repos, titles, or labels..."
                className="pl-10 pr-10 bg-zinc-900/60 border-zinc-800 focus:border-sky-500/50 focus:ring-sky-500/20 placeholder:text-zinc-600"
                data-testid="issues-table-search-input"
              />
              {issueQuery && (
                <button
                  onClick={() => setIssueQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Filter bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px]">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>

            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-3 p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50">
                    {/* Language filters */}
                    <FilterSection title="Language">
                      {LANGUAGES.map(lang => (
                        <FilterChip
                          key={lang}
                          label={lang}
                          active={languages.includes(lang)}
                          onClick={() => toggleLang(lang)}
                          testId={`filter-lang-${lang.toLowerCase()}`}
                        />
                      ))}
                    </FilterSection>

                    {/* Difficulty filters */}
                    <FilterSection title="Difficulty">
                      {DIFFICULTIES.map(diff => (
                        <FilterChip
                          key={diff}
                          label={diff}
                          active={difficulties.includes(diff)}
                          onClick={() => toggleDiff(diff)}
                          testId={`filter-diff-${diff.toLowerCase()}`}
                        />
                      ))}
                    </FilterSection>

                    {/* Rarity filters */}
                    <FilterSection title="Rarity">
                      {RARITIES.map(r => {
                        const Icon = RARITY[r]?.icon;
                        return (
                          <FilterChip
                            key={r}
                            label={RARITY[r]?.label}
                            active={rarities.includes(r)}
                            onClick={() => toggleRarity(r)}
                            icon={Icon}
                            testId={`filter-rarity-${r}`}
                          />
                        );
                      })}
                    </FilterSection>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Issue list */}
          <div className="space-y-2">
            {issuesLoading ? (
              // Loading skeletons
              Array.from({ length: 5 }).map((_, i) => (
                <div 
                  key={i} 
                  className="h-[88px] rounded-xl shimmer"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))
            ) : paginatedIssues.length > 0 ? (
              paginatedIssues.map((issue, index) => (
                <IssueCardRow 
                  key={issue.id} 
                  issue={issue} 
                  onChoose={handleChooseIssue} 
                  choosingIssueId={choosingIssueId}
                  index={index}
                />
              ))
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16 rounded-xl border border-dashed border-zinc-800"
              >
                <Shuffle className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-500 font-mono text-sm">No issues match your filters.</p>
                <button
                  onClick={clearAllFilters}
                  className="mt-3 text-xs text-sky-400 hover:text-sky-300 font-mono transition-colors"
                >
                  Clear filters
                </button>
              </motion.div>
            )}
          </div>

          {/* Pagination */}
          {!issuesLoading && filteredIssues.length > 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex flex-wrap items-center justify-between gap-4 mt-8 pt-6 border-t border-zinc-800/50"
            >
              {/* Left: count + page size */}
              <div className="flex items-center gap-4">
                <span className="text-xs text-zinc-500 font-mono">
                  {filteredIssues.length} issue{filteredIssues.length !== 1 ? 's' : ''}
                </span>
                <div className="w-px h-4 bg-zinc-800" />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-600 font-mono">Show</span>
                  <select
                    data-testid="page-size-select"
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    className="text-xs font-mono bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-sky-500/50 transition-colors cursor-pointer"
                  >
                    {[10, 25, 50, 100].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Right: pagination controls */}
              <div className="flex items-center gap-2">
                {/* First/Prev */}
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700 hover:bg-zinc-800/50 disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700 hover:bg-zinc-800/50 disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Page numbers */}
                <div className="flex items-center gap-1 mx-2">
                  {getPageNumbers().map(p => (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`
                        min-w-[36px] h-9 rounded-lg text-xs font-mono transition-all
                        ${p === currentPage
                          ? 'bg-sky-500/15 border border-sky-500/40 text-sky-200'
                          : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50'
                        }
                      `}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {/* Next/Last */}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700 hover:bg-zinc-800/50 disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700 hover:bg-zinc-800/50 disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>

                {/* Page jump */}
                <div className="w-px h-5 bg-zinc-800 mx-2" />
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-zinc-600">Go to</span>
                  <input
                    data-testid="page-jump-input"
                    type="number"
                    min={1}
                    max={totalPages}
                    placeholder={String(currentPage)}
                    className="w-14 h-9 text-xs font-mono text-center bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg outline-none focus:border-sky-500/50 transition-colors"
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
            </motion.div>
          )}
        </motion.section>
      </div>

      {/* PR Dialog */}
      <Dialog open={showPRDialog} onOpenChange={setShowPRDialog}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md" data-testid="pr-dialog" aria-describedby="pr-dialog-description">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white">Submit Pull Request</DialogTitle>
            <DialogDescription id="pr-dialog-description" className="text-zinc-400 text-sm">
              Paste your pull request URL to track merge progress and earn XP.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Input 
              placeholder="https://github.com/.../pull/123" 
              value={prUrl} 
              onChange={e => setPrUrl(e.target.value)}
              className="bg-zinc-900 border-zinc-800 font-mono text-sm focus:border-sky-500/50" 
              data-testid="pr-url-input" 
            />
            <button 
              onClick={handleSubmitPR} 
              className="w-full py-3 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-200 font-semibold text-sm uppercase tracking-wider hover:bg-sky-500/25 hover:border-sky-400/50 transition-all" 
              data-testid="pr-submit-confirm"
            >
              Submit PR
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
