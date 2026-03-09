import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, ChevronLeft, ChevronRight, ExternalLink, Clock, X, Send, CircleCheck as CheckCircle2, Zap, Sparkles } from 'lucide-react';
import { RarityBadge, RARITY } from '@/components/DrawAnimation';
import { colors, accent } from '@/lib/theme';

export default function InfoSidebar({ redrawsRemaining, activeBookmarks, onSubmitPR, onVerify, onRelease, getCountdown }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= activeBookmarks.length) {
      setActiveIndex(Math.max(0, activeBookmarks.length - 1));
    }
  }, [activeBookmarks.length, activeIndex]);

  const currentBookmark = activeBookmarks[activeIndex] || null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      data-testid="info-sidebar"
      className="relative w-64 flex-shrink-0 space-y-4"
    >
      <motion.div
        whileHover={{ scale: 1.01, y: -2 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="obsidian rounded-xl p-5 relative overflow-hidden group"
      >
        <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${accent.divider} to-transparent`} />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Zap className={`w-4 h-4 ${accent.textMuted}`} />
            <p className="text-sm font-mono uppercase tracking-[0.18em] text-zinc-500">Draw Budget</p>
          </div>
          <div className="flex items-baseline gap-2">
            <p className={`text-2xl font-bold ${accent.text}`}>{redrawsRemaining}</p>
            <p className="text-sm text-zinc-500 font-mono">remaining</p>
          </div>
        </div>
        <div className="absolute bottom-0 right-0 w-20 h-20 rounded-full blur-xl transition-colors duration-500" style={{ background: `rgba(${colors.accent.rgb},0.03)` }} />
      </motion.div>

      <motion.div
        whileHover={{ scale: 1.01, y: -2 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="obsidian rounded-xl p-5 relative overflow-hidden group"
      >
        <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${accent.divider} to-transparent`} />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Bookmark className={`w-4 h-4 ${accent.textMuted}`} />
            <p className="text-sm font-mono uppercase tracking-[0.18em] text-zinc-500">Active Work</p>
          </div>

          {activeBookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6">
              <div className="w-12 h-12 rounded-full bg-zinc-800/40 border border-white/5 flex items-center justify-center mb-3">
                <Bookmark className="w-5 h-5 text-zinc-600" />
              </div>
              <p className="text-base text-zinc-400 font-medium">No active work</p>
              <p className="text-sm text-zinc-600 mt-1">Choose and bookmark up to five issues</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-zinc-950/50 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => setActiveIndex((idx) => Math.max(0, idx - 1))}
                  disabled={activeIndex === 0}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <p className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">
                  Viewing {activeIndex + 1} of {activeBookmarks.length}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveIndex((idx) => Math.min(activeBookmarks.length - 1, idx + 1))}
                  disabled={activeIndex === activeBookmarks.length - 1}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {currentBookmark && (
                <motion.div
                  key={currentBookmark.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-3 rounded-xl border border-white/[0.06] bg-zinc-950/45 p-3 min-h-[320px]"
                >
                  <RarityBadge rarity={currentBookmark.rarity} />
                  <p className="text-sm font-mono text-zinc-400 truncate">{currentBookmark.repo}</p>
                  <p className="text-base text-zinc-200 leading-snug line-clamp-3 font-medium min-h-[72px]">{currentBookmark.title}</p>

                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-zinc-900/60 border border-white/[0.06]">
                    <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">{currentBookmark.status === 'pr_submitted' ? 'PR Submitted' : 'Bookmarked'}</span>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-zinc-500" strokeWidth={1.5} />
                      <span className="text-sm font-mono text-zinc-400">{getCountdown(currentBookmark.expires_at)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    {currentBookmark.status === 'bookmarked' && (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        data-testid="submit-pr-button"
                        className="rune-btn px-3 py-2 rounded-lg text-sm font-mono uppercase tracking-wider w-full text-center flex items-center justify-center gap-2"
                        onClick={() => onSubmitPR(currentBookmark.id)}
                      >
                        <Send className="w-3.5 h-3.5" />
                        Submit PR
                      </motion.button>
                    )}
                    {currentBookmark.status === 'pr_submitted' && (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        data-testid="verify-pr-button"
                        className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-mono uppercase tracking-wider w-full flex items-center justify-center gap-2 shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_-5px_rgba(16,185,129,0.5)] hover:bg-emerald-500/20 transition-all duration-200"
                        onClick={() => onVerify(currentBookmark.id)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Verify Merge
                      </motion.button>
                    )}
                    <motion.a
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      data-testid="bookmark-github-link"
                      href={currentBookmark.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-lg text-zinc-400 hover:text-white text-sm font-mono uppercase tracking-wider hover:bg-white/5 border border-white/[0.06] hover:border-white/10 flex items-center justify-center gap-2 transition-all duration-200"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View on GitHub
                    </motion.a>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      data-testid="release-bookmark-button"
                      className="px-3 py-2 rounded-lg text-zinc-500 hover:text-red-400 text-sm font-mono uppercase tracking-wider hover:bg-red-500/5 border border-transparent hover:border-red-500/20 w-full flex items-center justify-center gap-2 transition-all duration-200"
                      onClick={() => onRelease(currentBookmark.id)}
                    >
                      <X className="w-3.5 h-3.5" />
                      Release
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      <motion.div
        whileHover={{ scale: 1.01, y: -2 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="obsidian rounded-xl p-5 relative overflow-hidden group"
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-300/20 to-transparent" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-purple-300/60" />
            <p className="text-sm font-mono uppercase tracking-[0.18em] text-zinc-500">Draw Rewards</p>
          </div>
          <div className="space-y-2">
            {Object.entries(RARITY).map(([key, data]) => (
              <motion.div
                key={key}
                whileHover={{ x: 2 }}
                className="flex items-center justify-between text-sm font-mono py-1.5 px-2 rounded-md hover:bg-white/[0.02] transition-colors"
              >
                <span style={{ color: `${data.accent}0.8)` }}>{data.label}</span>
                <span className="text-zinc-400">+{data.drawXP} XP</span>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="absolute bottom-0 right-0 w-20 h-20 bg-purple-300/[0.03] rounded-full blur-xl group-hover:bg-purple-300/[0.06] transition-colors duration-500" />
      </motion.div>
    </motion.div>
  );
}
