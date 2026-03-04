import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { Shuffle, Bookmark, ExternalLink, RotateCcw, Star, FolderGit2, Clock, X, Send, CheckCircle2, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LANGUAGES = ['JavaScript', 'TypeScript', 'Python', 'Rust', 'Go', 'Java', 'Ruby', 'C', 'Dart', 'Elixir'];
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];
const DIFF_COLORS = { Beginner: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', Intermediate: 'bg-blue-500/10 text-blue-400 border-blue-500/20', Advanced: 'bg-red-500/10 text-red-400 border-red-500/20' };

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

  const handleDraw = async () => {
    if (!user) { setShowLogin(true); return; }
    shuffleRef.current = Array.from({ length: 5 }, () => ({
      x: (Math.random() - 0.5) * 250, y: (Math.random() - 0.5) * 120, rotate: (Math.random() - 0.5) * 50,
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
  };

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
      if (activeBookmark?.id === prDrawId) {
        setActiveBookmark(prev => prev ? { ...prev, status: 'pr_submitted', pr_url: prUrl } : null);
      }
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
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    return `${d}d ${h}h remaining`;
  };

  return (
    <div className="pt-20 pb-16 px-4 md:px-8 lg:px-12 max-w-6xl mx-auto" data-testid="discover-page">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Discover</h1>
        <p className="text-muted-foreground text-base md:text-lg mb-8">Draw your next open-source contribution from the archive.</p>
      </motion.div>

      {/* Active Bookmark */}
      {activeBookmark && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <Card className="border-amber-500/30 bg-amber-500/5" data-testid="active-bookmark">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span className="text-sm font-medium text-amber-500">Active Bookmark</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-mono">{getCountdown(activeBookmark.expires_at)}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <FolderGit2 className="w-3.5 h-3.5" />{activeBookmark.repo}
              </div>
              <p className="font-medium text-sm">{activeBookmark.title}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="text-xs">{activeBookmark.language}</Badge>
                <Badge variant="outline" className={`text-xs ${DIFF_COLORS[activeBookmark.difficulty] || ''}`}>{activeBookmark.difficulty}</Badge>
              </div>
            </CardContent>
            <CardFooter className="flex gap-2 flex-wrap">
              {activeBookmark.status === 'bookmarked' && (
                <Button size="sm" className="bg-amber-500 text-black hover:bg-amber-400" data-testid="submit-pr-button"
                  onClick={() => { setPrDrawId(activeBookmark.id); setShowPRDialog(true); }}>
                  <Send className="w-3.5 h-3.5 mr-1" />Submit PR
                </Button>
              )}
              {activeBookmark.status === 'pr_submitted' && (
                <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500" data-testid="verify-pr-button"
                  onClick={() => handleVerify(activeBookmark.id)}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Verify Merge
                </Button>
              )}
              <Button size="sm" variant="outline" asChild><a href={activeBookmark.url} target="_blank" rel="noopener noreferrer" data-testid="bookmark-github-link"><ExternalLink className="w-3.5 h-3.5 mr-1" />GitHub</a></Button>
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={handleRelease} data-testid="release-bookmark-button">
                <X className="w-3.5 h-3.5 mr-1" />Release
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      )}

      {/* Filters */}
      <div className="mb-10 space-y-4" data-testid="filter-section">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2.5">Languages</p>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map(lang => (
              <button key={lang} onClick={() => toggleLang(lang)} data-testid={`filter-lang-${lang.toLowerCase()}`}
                className={`px-3 py-1.5 rounded-md text-sm border font-medium ${
                  languages.includes(lang) ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:border-border'
                }`} style={{ transition: 'color 0.15s, border-color 0.15s, background-color 0.15s' }}>
                {lang}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2.5">Difficulty</p>
          <div className="flex flex-wrap gap-2">
            {DIFFICULTIES.map(diff => (
              <button key={diff} onClick={() => toggleDiff(diff)} data-testid={`filter-diff-${diff.toLowerCase()}`}
                className={`px-3 py-1.5 rounded-md text-sm border font-medium ${
                  difficulties.includes(diff) ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:border-border'
                }`} style={{ transition: 'color 0.15s, border-color 0.15s, background-color 0.15s' }}>
                {diff}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Card Draw Area */}
      <div className="flex flex-col items-center mb-12" data-testid="card-draw-area">
        <div className="relative w-72 h-96 mb-8">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-xl border border-border bg-card flex items-center justify-center cursor-default"
              style={{ zIndex: 5 - i }}
              animate={
                drawState === 'shuffling' ? {
                  x: shuffleRef.current[i]?.x || 0,
                  y: shuffleRef.current[i]?.y || 0,
                  rotate: shuffleRef.current[i]?.rotate || 0,
                  opacity: 0.6,
                } : drawState === 'revealed' && i === 0 ? {
                  x: 0, y: 0, rotate: 0, scale: 1, opacity: 1,
                } : {
                  x: i * 3, y: -i * 4, rotate: (i - 2) * 2.5, scale: 1 - i * 0.015, opacity: 1 - i * 0.12,
                }
              }
              transition={{ type: 'spring', stiffness: 180, damping: 18, mass: 0.8 }}
            >
              {drawState === 'revealed' && i === 0 && drawnIssue ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="p-6 w-full h-full flex flex-col">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                    <FolderGit2 className="w-3.5 h-3.5" />
                    <span className="truncate">{drawnIssue.repo}</span>
                  </div>
                  <h3 className="font-serif text-lg font-semibold leading-snug mb-4 flex-grow">{drawnIssue.title}</h3>
                  <div className="space-y-3 mt-auto">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{drawnIssue.language}</Badge>
                      <Badge variant="outline" className={`text-xs ${DIFF_COLORS[drawnIssue.difficulty] || ''}`}>{drawnIssue.difficulty}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-500" />{drawnIssue.stars?.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {drawnIssue.labels?.map(l => <span key={l} className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">{l}</span>)}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="text-center">
                  <BookOpen className="w-10 h-10 text-amber-500/40 mx-auto mb-3" />
                  <p className="font-serif text-sm text-amber-500/60">GitFable</p>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Draw / Action Buttons */}
        <AnimatePresence mode="wait">
          {drawState === 'idle' && (
            <motion.div key="draw" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3">
              <Button onClick={handleDraw} className="bg-amber-500 text-black hover:bg-amber-400 font-semibold h-12 px-8 text-base rounded-md" data-testid="draw-button">
                <Shuffle className="w-4 h-4 mr-2" />Draw Issue
              </Button>
              <p className="text-xs text-muted-foreground font-mono">{redrawsRemaining} draws remaining today</p>
            </motion.div>
          )}
          {drawState === 'shuffling' && (
            <motion.div key="shuffling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="text-sm text-amber-500 animate-pulse font-medium">Shuffling the archive...</p>
            </motion.div>
          )}
          {drawState === 'revealed' && drawnIssue && (
            <motion.div key="actions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap gap-3 justify-center">
              <Button onClick={handleBookmark} className="bg-amber-500 text-black hover:bg-amber-400 font-semibold" data-testid="bookmark-button">
                <Bookmark className="w-4 h-4 mr-1" />Bookmark Issue
              </Button>
              <Button variant="outline" onClick={() => { setDrawState('idle'); setDrawnIssue(null); }} data-testid="redraw-button">
                <RotateCcw className="w-4 h-4 mr-1" />Redraw
              </Button>
              <Button variant="ghost" asChild>
                <a href={drawnIssue.url} target="_blank" rel="noopener noreferrer" data-testid="view-github-button">
                  <ExternalLink className="w-4 h-4 mr-1" />View on GitHub
                </a>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* PR Dialog */}
      <Dialog open={showPRDialog} onOpenChange={setShowPRDialog}>
        <DialogContent className="bg-card border-border" data-testid="pr-dialog">
          <DialogHeader>
            <DialogTitle className="font-serif">Submit Pull Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Input placeholder="https://github.com/.../pull/123" value={prUrl} onChange={e => setPrUrl(e.target.value)}
              className="bg-secondary border-border" data-testid="pr-url-input" />
            <Button onClick={handleSubmitPR} className="w-full bg-amber-500 text-black hover:bg-amber-400 font-semibold" data-testid="pr-submit-confirm">
              Submit PR
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
