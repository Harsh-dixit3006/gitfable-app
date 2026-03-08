import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Sparkles, Zap, ListFilter as Filter, X } from 'lucide-react';
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

// Floating orbs animation component
function FloatingOrb({ delay = 0, duration = 20, color = 'rgba(125,211,252,0.15)', size = 300 }) {
  return (
    <motion.div
      className="absolute rounded-full blur-3xl pointer-events-none"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle, ${color}, transparent 70%)`,
      }}
      animate={{
        x: [0, 100, -50, 0],
        y: [0, -80, 100, 0],
        scale: [1, 1.1, 0.9, 1],
        opacity: [0.3, 0.5, 0.3, 0.3],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
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
  const [showFilters, setShowFilters] = useState(false);
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

  const activeFilterCount = languages.length + difficulties.length + rarities.length;

  return (
    <div className="relative min-h-screen overflow-hidden" data-testid="discover-page">
      {/* Animated background with floating orbs */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950" />
        <FloatingOrb delay={0} duration={25} color="rgba(125,211,252,0.08)" size={400} />
        <FloatingOrb delay={3} duration={30} color="rgba(168,85,247,0.06)" size={350} />
        <FloatingOrb delay={6} duration={28} color="rgba(251,191,36,0.05)" size={300} />
      </div>

      {/* Grid overlay */}
      <div className="fixed inset-0 -z-10 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }} />
      </div>

      <div className="relative pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE }}
            className="text-center mb-16"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-300/5 border border-sky-300/20 mb-6"
            >
              <Sparkles className="w-4 h-4 text-sky-300" />
              <span className="text-sm font-mono text-sky-200 tracking-wider">DISCOVER YOUR NEXT QUEST</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight"
            >
              <span className="bg-gradient-to-br from-white via-sky-100 to-zinc-400 bg-clip-text text-transparent">
                Draw Your Destiny
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed"
            >
              Experience the thrill of discovering perfect open-source issues through our gamified system.
              <br />
              Each draw is a new adventure waiting to unfold.
            </motion.p>
          </motion.div>

          {/* Main Draw Area */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.7, ease: EASE }}
            className="flex flex-col lg:flex-row gap-8 items-start justify-center mb-24"
          >
            <InfoSidebar
              redrawsRemaining={redrawsRemaining}
              activeBookmark={activeBookmark}
              onSubmitPR={(drawId) => { setPrDrawId(drawId); setShowPRDialog(true); }}
              onVerify={(drawId) => handleVerify(drawId)}
              onRelease={handleRelease}
              getCountdown={getCountdown}
            />

            <div className="flex-1 w-full max-w-2xl">
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

          {/* Browse Section Divider */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="relative mb-16"
          >
            <div className="absolute inset-0 flex items-center">
              <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
            <div className="relative flex justify-center">
              <div className="px-6 py-2 rounded-full bg-zinc-950/90 border border-white/10 backdrop-blur-sm">
                <span className="text-sm font-mono text-zinc-500 uppercase tracking-wider">Browse Collection</span>
              </div>
            </div>
          </motion.div>

          {/* Browse Section */}
          <motion.section
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6, ease: EASE }}
            data-testid="issues-table-section"
          >
            {/* Search and Filter Header */}
            <div className="flex flex-col gap-6 mb-8">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold mb-2 bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent" data-testid="issues-table-title">
                    All Issues
                  </h2>
                  <p className="text-sm text-zinc-500" data-testid="issues-table-subtitle">
                    {filteredIssues.length.toLocaleString()} issues available
                  </p>
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                  <div className="relative flex-1 md:w-80">
                    <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <Input
                      value={issueQuery}
                      onChange={(e) => setIssueQuery(e.target.value)}
                      placeholder="Search issues..."
                      className="pl-11 pr-4 py-3 bg-zinc-900/40 border-white/[0.08] rounded-xl hover:border-white/15 focus:border-sky-300/40 transition-all backdrop-blur-sm"
                      data-testid="issues-table-search-input"
                    />
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowFilters(!showFilters)}
                    className={`relative px-4 py-3 rounded-xl border backdrop-blur-sm transition-all ${
                      showFilters || activeFilterCount > 0
                        ? 'bg-sky-300/10 border-sky-300/40 text-sky-200'
                        : 'bg-zinc-900/40 border-white/[0.08] text-zinc-400 hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4" />
                      <span className="font-mono text-sm hidden sm:inline">Filters</span>
                    </div>
                    {activeFilterCount > 0 && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-sky-400 text-zinc-950 text-xs font-bold flex items-center justify-center"
                      >
                        {activeFilterCount}
                      </motion.div>
                    )}
                  </motion.button>
                </div>
              </div>

              {/* Filter Panel */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <div className="p-6 rounded-xl bg-zinc-900/40 border border-white/[0.08] backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Filter className="w-4 h-4 text-zinc-500" />
                          <span className="text-sm font-mono text-zinc-400 uppercase tracking-wider">Active Filters</span>
                        </div>
                        {activeFilterCount > 0 && (
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setLanguages([]);
                              setDifficulties([]);
                              setRarities([]);
                            }}
                            className="text-xs font-mono text-red-400/80 hover:text-red-400 flex items-center gap-1.5"
                          >
                            <X className="w-3.5 h-3.5" />
                            Clear all
                          </motion.button>
                        )}
                      </div>

                      <div className="space-y-4">
                        {/* Languages */}
                        <div>
                          <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider block mb-2">Languages</label>
                          <div className="flex flex-wrap gap-2">
                            {LANGUAGES.map((lang) => (
                              <motion.button
                                key={lang}
                                whileHover={{ scale: 1.05, y: -1 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => toggleLang(lang)}
                                data-testid={`filter-lang-${lang.toLowerCase()}`}
                                className={`px-3 py-1.5 rounded-lg text-xs font-mono border backdrop-blur-sm transition-all ${
                                  languages.includes(lang)
                                    ? 'bg-sky-300/10 border-sky-300/40 text-sky-200 shadow-[0_0_12px_-4px_rgba(125,211,252,0.4)]'
                                    : 'bg-zinc-900/60 border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:border-white/15'
                                }`}
                              >
                                {lang}
                              </motion.button>
                            ))}
                          </div>
                        </div>

                        {/* Difficulties */}
                        <div>
                          <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider block mb-2">Difficulty</label>
                          <div className="flex flex-wrap gap-2">
                            {DIFFICULTIES.map((diff) => (
                              <motion.button
                                key={diff}
                                whileHover={{ scale: 1.05, y: -1 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => toggleDiff(diff)}
                                data-testid={`filter-diff-${diff.toLowerCase()}`}
                                className={`px-3 py-1.5 rounded-lg text-xs font-mono border backdrop-blur-sm transition-all ${
                                  difficulties.includes(diff)
                                    ? 'bg-sky-300/10 border-sky-300/40 text-sky-200 shadow-[0_0_12px_-4px_rgba(125,211,252,0.4)]'
                                    : 'bg-zinc-900/60 border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:border-white/15'
                                }`}
                              >
                                {diff}
                              </motion.button>
                            ))}
                          </div>
                        </div>

                        {/* Rarities */}
                        <div>
                          <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider block mb-2">Rarity</label>
                          <div className="flex flex-wrap gap-2">
                            {RARITIES.map((r) => {
                              const Icon = RARITY[r].icon;
                              const rarityData = RARITY[r];
                              return (
                                <motion.button
                                  key={r}
                                  whileHover={{ scale: 1.05, y: -1 }}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => toggleRarity(r)}
                                  data-testid={`filter-rarity-${r}`}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-mono border backdrop-blur-sm inline-flex items-center gap-1.5 transition-all`}
                                  style={rarities.includes(r) ? {
                                    background: `${rarityData.accent}0.08)`,
                                    borderColor: `${rarityData.accent}0.4)`,
                                    color: `${rarityData.accent}0.95)`,
                                    boxShadow: `0 0 12px -4px ${rarityData.accent}0.4)`,
                                  } : {
                                    background: 'rgba(24,24,27,0.6)',
                                    borderColor: 'rgba(255,255,255,0.06)',
                                    color: 'rgb(161,161,170)',
                                  }}
                                >
                                  {Icon && <Icon className="w-3.5 h-3.5" />}
                                  {rarityData.label}
                                </motion.button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Issues Grid */}
            {issuesLoading ? (
              <div className="grid gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.4 }}
                    className="h-28 rounded-2xl shimmer"
                  />
                ))}
              </div>
            ) : (
              <>
                <div className="grid gap-4">
                  <AnimatePresence mode="popLayout">
                    {paginatedIssues.map((issue, idx) => (
                      <motion.div
                        key={issue.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: idx * 0.02, duration: 0.3, ease: EASE }}
                      >
                        <IssueCardRow issue={issue} onChoose={handleChooseIssue} choosingIssueId={choosingIssueId} />
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {filteredIssues.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center justify-center py-24 px-6"
                    >
                      <motion.div
                        animate={{
                          rotate: [0, 5, -5, 0],
                        }}
                        transition={{
                          duration: 3,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                        className="w-20 h-20 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/[0.06] flex items-center justify-center mb-6"
                      >
                        <Search className="w-9 h-9 text-zinc-600" />
                      </motion.div>
                      <p className="text-xl font-semibold text-zinc-300 mb-2">No issues found</p>
                      <p className="text-zinc-500 text-center max-w-md">Try adjusting your search or filters to discover more open-source opportunities</p>
                    </motion.div>
                  )}
                </div>

                {/* Pagination */}
                {filteredIssues.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex flex-wrap items-center justify-between gap-4 mt-8 p-4 rounded-xl bg-zinc-900/40 border border-white/[0.06] backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-zinc-400 font-mono">
                        {filteredIssues.length.toLocaleString()} issue{filteredIssues.length !== 1 ? 's' : ''}
                      </span>
                      <div className="w-px h-4 bg-white/10" />
                      <select
                        data-testid="page-size-select"
                        value={pageSize}
                        onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                        className="text-sm font-mono bg-zinc-950/60 border border-white/10 text-zinc-400 rounded-lg px-3 py-1.5 outline-none focus:border-sky-300/40 transition-colors"
                      >
                        {[10, 25, 50, 100].map(s => <option key={s} value={s}>{s} / page</option>)}
                        )
                        }
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="w-9 h-9 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-all"
                      >
                        <ChevronsLeft className="w-4 h-4" />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="w-9 h-9 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-all"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </motion.button>

                      <div className="flex items-center gap-1">
                        {getPageNumbers().map(p => (
                          <motion.button
                            key={p}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setCurrentPage(p)}
                            className={`min-w-[36px] h-9 rounded-lg text-sm font-mono transition-all ${
                              p === currentPage
                                ? 'bg-sky-300/10 border border-sky-300/30 text-sky-200 shadow-[0_0_12px_-4px_rgba(125,211,252,0.4)]'
                                : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'
                            }`}
                          >
                            {p}
                          </motion.button>
                        ))}
                      </div>

                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="w-9 h-9 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-all"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="w-9 h-9 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-all"
                      >
                        <ChevronsRight className="w-4 h-4" />
                      </motion.button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-zinc-500">Jump to</span>
                      <input
                        data-testid="page-jump-input"
                        type="number"
                        min={1}
                        max={totalPages}
                        placeholder={currentPage.toString()}
                        className="w-16 h-9 text-sm font-mono text-center bg-zinc-950/60 border border-white/10 text-zinc-400 rounded-lg outline-none focus:border-sky-300/40 transition-colors"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseInt(e.target.value, 10);
                            if (val >= 1 && val <= totalPages) setCurrentPage(val);
                            e.target.value = '';
                          }
                        }}
                      />
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </motion.section>
        </div>
      </div>

      {/* PR Dialog */}
      <Dialog open={showPRDialog} onOpenChange={setShowPRDialog}>
        <DialogContent className="bg-zinc-950 border-white/10 backdrop-blur-xl" data-testid="pr-dialog" aria-describedby="pr-dialog-description">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent">Submit Pull Request</DialogTitle>
            <DialogDescription id="pr-dialog-description" className="text-zinc-400 text-sm mt-2">
              Paste your pull request URL to track and verify merge progress.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Input
              placeholder="https://github.com/.../pull/123"
              value={prUrl}
              onChange={e => setPrUrl(e.target.value)}
              className="bg-zinc-900/60 border-white/10 font-mono text-sm py-3 rounded-xl focus:border-sky-300/40 transition-colors"
              data-testid="pr-url-input"
            />
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSubmitPR}
              className="rune-btn w-full py-3 rounded-xl text-center font-semibold"
              data-testid="pr-submit-confirm"
            >
              Submit PR
            </motion.button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
