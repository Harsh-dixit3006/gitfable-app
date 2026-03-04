import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { Shuffle, Bookmark, ExternalLink, RotateCcw, Star, FolderGit2, Clock, X, Send, CheckCircle2, BookOpen, Zap } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LANGUAGES = ['JavaScript', 'TypeScript', 'Python', 'Rust', 'Go', 'Java', 'Ruby', 'C', 'Dart', 'Elixir'];
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];
const DIFF_COLORS = {
  Beginner: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Intermediate: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Advanced: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function Discover() {
  const { user, token, setShowLogin, refreshUser } = useAuth();
  const [languages, setLanguages] = useState([]);
  const [difficulties, setDifficulties] = useState([]);
  const [drawState, setDrawState] = useState('idle');
  const [drawnIssue, setDrawnIssue] = useState(null);
  const [redrawsRemaining, setRedrawsRemaining] = useState(3);
  const [activeBookmark, setActiveBookmark] = useState(null);
  const [showPRDialog, setShowPRDialog] = useState(false);
  const [prUrl, setPrUrl] = useState('');
  const [prDrawId, setPrDrawId] = useState(null);
  const shuffleRef = useRef([]);

  useEffect(() => {
    if (user?.active_bookmark) {
      loadBookmark(user.active_bookmark.draw_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadBookmark = async (drawId) => {
    try {
      const res = await axios.get(`${API}/draws/history`, { headers: { Authorization: `Bearer ${token}` } });
      const bm = res.data.draws.find(d => d.id === drawId && (d.status === 'bookmarked' || d.status === 'pr_submitted'));
      if (bm) setActiveBookmark({ ...bm, expires_at: user?.active_bookmark?.expires_at });
    } catch { /* ignore */ }
  };

  const toggleLang = (lang) => setLanguages(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]);
  const toggleDiff = (diff) => setDifficulties(prev => prev.includes(diff) ? prev.filter(d => d !== diff) : [...prev, diff]);

  const handleDraw = useCallback(async () => {
    if (!user) { setShowLogin(true); return; }
    shuffleRef.current = Array.from({ length: 5 }, () => ({
      x: (Math.random() - 0.5) * 280, y: (Math.random() - 0.5) * 140, rotate: (Math.random() - 0.5) * 60,
    }));
    setDrawState('shuffling');
    setDrawnIssue(null);
    try {
      const res = await axios.post(`${API}/draws/draw`, { languages, difficulties }, { headers: { Authorization: `Bearer ${token}` } });
      setRedrawsRemaining(res.data.redraws_remaining ?? 2);
      setTimeout(() => { setDrawnIssue(res.data); setDrawState('revealed'); }, 1500);
    } catch (err) {
      setDrawState('idle');
      toast.error(err.response?.data?.detail || 'Draw failed');
    }
  }, [user, token, languages, difficulties, setShowLogin]);

  const handleBookmark = async () => {
    if (!drawnIssue) return;
    try {
      await axios.post(`${API}/draws/${drawnIssue.id}/bookmark`, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Issue bookmarked! You have 7 days.');
      await refreshUser();
      setDrawState('idle');
      setDrawnIssue(null);
    } catch (err) { toast.error(err.response?.data?.detail || 'Bookmark failed'); }
  };

  const handleRelease = async () => {
    if (!activeBookmark) return;
    try {
      await axios.post(`${API}/draws/${activeBookmark.id}/release`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setActiveBookmark(null);
      toast.success('Bookmark released');
      await refreshUser();
    } catch (err) { toast.error(err.response?.data?.detail || 'Release failed'); }
  };

  const handleSubmitPR = async () => {
    if (!prUrl.trim() || !prDrawId) return;
    try {
      await axios.post(`${API}/draws/${prDrawId}/submit-pr`, { pr_url: prUrl }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('PR submitted! +25 XP');
      setShowPRDialog(false);
      setPrUrl('');
      if (activeBookmark?.id === prDrawId) setActiveBookmark(prev => prev ? { ...prev, status: 'pr_submitted', pr_url: prUrl } : null);
    } catch (err) { toast.error(err.response?.data?.detail || 'Submit failed'); }
  };

  const handleVerify = async (drawId) => {
    try {
      const res = await axios.post(`${API}/draws/${drawId}/verify`, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`PR merged! +100 XP ${res.data.new_badges?.length ? '+ New badge!' : ''}`);
      setActiveBookmark(null);
      await refreshUser();
    } catch (err) { toast.error(err.response?.data?.detail || 'Verification failed'); }
  };

  const getCountdown = (expiresAt) => {
    if (!expiresAt) return '';
    const diff = new Date(expiresAt) - Date.now();
    if (diff <= 0) return 'Expired';
    return `${Math.floor(diff / 86400000)}d ${Math.floor((diff % 86400000) / 3600000)}h`;
  };

  return (
    <div className="pt-20 pb-16 relative" data-testid="discover-page">
      {/* Ambient glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />

      <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-serif mb-2 tracking-tight">
            <span className="text-amber-500 font-mono text-xl">//</span> Discover
          </h1>
          <p className="text-zinc-400 text-base md:text-lg mb-8">Draw your next contribution from the archive.</p>
        </motion.div>

        {/* Active Bookmark */}
        {activeBookmark && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8" data-testid="active-bookmark">
            <div className="obsidian inner-glow rounded-xl p-5 border-amber-500/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span className="font-mono text-xs text-amber-500 uppercase tracking-wider">Active Bookmark</span>
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
                <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-mono">{activeBookmark.language}</span>
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
        <div className="obsidian rounded-xl p-6 mb-10" data-testid="filter-section">
          <div className="mb-5">
            <p className="font-mono text-xs text-zinc-500 uppercase tracking-wider mb-3">Languages</p>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map(lang => (
                <button key={lang} onClick={() => toggleLang(lang)} data-testid={`filter-lang-${lang.toLowerCase()}`}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono border ${
                    languages.includes(lang) ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 shadow-[0_0_10px_-3px_rgba(245,158,11,0.3)]' : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10'
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
                    difficulties.includes(diff) ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 shadow-[0_0_10px_-3px_rgba(245,158,11,0.3)]' : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10'
                  }`} style={{ transition: 'color 0.15s, border-color 0.15s, background-color 0.15s, box-shadow 0.15s' }}>
                  {diff}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Card Draw Area */}
        <div className="flex flex-col items-center mb-12" data-testid="card-draw-area">
          {/* Ambient glow ring */}
          <div className="relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full pointer-events-none" style={{ background: drawState === 'shuffling' ? 'radial-gradient(circle, rgba(245,158,11,0.15), transparent 70%)' : 'radial-gradient(circle, rgba(245,158,11,0.05), transparent 70%)', filter: 'blur(30px)', transition: 'background 0.5s' }} />

            <div className="relative w-72 h-96 mb-8">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className="absolute inset-0 obsidian rounded-xl flex items-center justify-center cursor-default overflow-hidden"
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
                  transition={{ type: 'spring', stiffness: 160, damping: 18, mass: 0.8 }}
                >
                  {/* Inner glow line on top */}
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />

                  {drawState === 'revealed' && i === 0 && drawnIssue ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="p-6 w-full h-full flex flex-col">
                      <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono mb-3">
                        <FolderGit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span className="truncate">{drawnIssue.repo}</span>
                      </div>
                      <h3 className="font-serif text-lg font-semibold leading-snug mb-auto text-zinc-100">{drawnIssue.title}</h3>
                      <div className="space-y-3 mt-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-mono">{drawnIssue.language}</span>
                          <Badge variant="outline" className={`text-xs ${DIFF_COLORS[drawnIssue.difficulty] || ''}`}>{drawnIssue.difficulty}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-500 font-mono">
                          <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-500/70" strokeWidth={1.5} />{drawnIssue.stars?.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {drawnIssue.labels?.map(l => <span key={l} className="text-xs px-2 py-0.5 rounded bg-zinc-900 text-zinc-500 border border-white/5 font-mono">{l}</span>)}
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="text-center">
                      <BookOpen className="w-10 h-10 text-amber-500/20 mx-auto mb-3" strokeWidth={1} />
                      <p className="font-serif text-sm text-amber-500/30">GitFable</p>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Draw / Action Buttons */}
          <AnimatePresence mode="wait">
            {drawState === 'idle' && (
              <motion.div key="draw" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4">
                <button onClick={handleDraw} className="rune-btn px-10 py-3.5 rounded-lg animate-pulse-glow" data-testid="draw-button">
                  <Shuffle className="w-4 h-4 inline mr-2" />Draw Issue
                </button>
                <div className="flex items-center gap-2 text-xs text-zinc-600 font-mono">
                  <Zap className="w-3 h-3 text-amber-500/40" />
                  {redrawsRemaining} draws remaining today
                </div>
              </motion.div>
            )}
            {drawState === 'shuffling' && (
              <motion.div key="shuffling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                <p className="font-mono text-xs text-amber-500 uppercase tracking-widest animate-pulse">Shuffling the archive...</p>
              </motion.div>
            )}
            {drawState === 'revealed' && drawnIssue && (
              <motion.div key="actions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap gap-3 justify-center">
                <button onClick={handleBookmark} className="rune-btn px-6 py-2.5 rounded-md" data-testid="bookmark-button">
                  <Bookmark className="w-3.5 h-3.5 inline mr-1.5" />Bookmark
                </button>
                <button className="px-6 py-2.5 text-zinc-400 hover:text-white font-mono text-xs uppercase tracking-widest hover:bg-white/5 rounded-md border border-white/5 hover:border-white/10" style={{ transition: 'color 0.2s, background-color 0.2s, border-color 0.2s' }} onClick={() => { setDrawState('idle'); setDrawnIssue(null); }} data-testid="redraw-button">
                  <RotateCcw className="w-3.5 h-3.5 inline mr-1.5" />Redraw
                </button>
                <a href={drawnIssue.url} target="_blank" rel="noopener noreferrer" className="px-6 py-2.5 text-zinc-400 hover:text-white font-mono text-xs uppercase tracking-widest hover:bg-white/5 rounded-md border border-white/5 hover:border-white/10 inline-flex items-center" style={{ transition: 'color 0.2s, background-color 0.2s, border-color 0.2s' }} data-testid="view-github-button">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />GitHub
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* PR Dialog */}
      <Dialog open={showPRDialog} onOpenChange={setShowPRDialog}>
        <DialogContent className="bg-zinc-950 border-white/10" data-testid="pr-dialog">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Submit Pull Request</DialogTitle>
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
