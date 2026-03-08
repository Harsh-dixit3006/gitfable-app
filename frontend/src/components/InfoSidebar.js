import { motion } from 'framer-motion';
import { Bookmark, ExternalLink, Clock, X, Send, CheckCircle2, Zap, Sparkles } from 'lucide-react';
import { RarityBadge, RARITY } from '@/components/DrawAnimation';

export default function InfoSidebar({ redrawsRemaining, activeBookmark, onSubmitPR, onVerify, onRelease, getCountdown }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      data-testid="info-sidebar"
      className="relative w-64 flex-shrink-0 space-y-4"
    >
      {/* Draw Budget Card */}
      <motion.div
        whileHover={{ scale: 1.01, y: -2 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="obsidian rounded-xl p-5 relative overflow-hidden group"
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-300/20 to-transparent" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3.5 h-3.5 text-sky-300/60" />
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Draw Budget</p>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-sky-100">{redrawsRemaining}</p>
            <p className="text-xs text-zinc-500 font-mono">remaining</p>
          </div>
        </div>
        <div className="absolute bottom-0 right-0 w-20 h-20 bg-sky-300/[0.03] rounded-full blur-xl group-hover:bg-sky-300/[0.06] transition-colors duration-500" />
      </motion.div>

      {/* Bookmark Card */}
      <motion.div
        whileHover={{ scale: 1.01, y: -2 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="obsidian rounded-xl p-5 relative overflow-hidden group"
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-300/20 to-transparent" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Bookmark className="w-3.5 h-3.5 text-amber-300/60" />
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Active Bookmark</p>
          </div>

          {!activeBookmark ? (
            <div className="flex flex-col items-center justify-center py-6">
              <div className="w-12 h-12 rounded-full bg-zinc-800/40 border border-white/5 flex items-center justify-center mb-3">
                <Bookmark className="w-5 h-5 text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-400 font-medium">No active bookmark</p>
              <p className="text-xs text-zinc-600 mt-1">Draw an issue to start</p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              <RarityBadge rarity={activeBookmark.rarity} />
              <p className="text-xs font-mono text-zinc-400 truncate">{activeBookmark.repo}</p>
              <p className="text-sm text-zinc-200 leading-snug line-clamp-2 font-medium">{activeBookmark.title}</p>

              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-zinc-900/60 border border-white/[0.06]">
                <Clock className="w-3 h-3 text-zinc-500" strokeWidth={1.5} />
                <span className="text-[10px] font-mono text-zinc-400">{getCountdown(activeBookmark.expires_at)}</span>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-2 pt-1">
                {activeBookmark.status === 'bookmarked' && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    data-testid="submit-pr-button"
                    className="rune-btn px-3 py-2 rounded-lg text-xs font-mono uppercase tracking-wider w-full text-center flex items-center justify-center gap-2"
                    onClick={() => onSubmitPR(activeBookmark.id)}
                  >
                    <Send className="w-3.5 h-3.5" />
                    Submit PR
                  </motion.button>
                )}
                {activeBookmark.status === 'pr_submitted' && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    data-testid="verify-pr-button"
                    className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono uppercase tracking-wider w-full flex items-center justify-center gap-2 shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_-5px_rgba(16,185,129,0.5)] hover:bg-emerald-500/20 transition-all duration-200"
                    onClick={() => onVerify(activeBookmark.id)}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Verify Merge
                  </motion.button>
                )}
                <motion.a
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  data-testid="bookmark-github-link"
                  href={activeBookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-lg text-zinc-400 hover:text-white text-xs font-mono uppercase tracking-wider hover:bg-white/5 border border-white/[0.06] hover:border-white/10 flex items-center justify-center gap-2 transition-all duration-200"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View on GitHub
                </motion.a>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  data-testid="release-bookmark-button"
                  className="px-3 py-2 rounded-lg text-zinc-500 hover:text-red-400 text-xs font-mono uppercase tracking-wider hover:bg-red-500/5 border border-transparent hover:border-red-500/20 w-full flex items-center justify-center gap-2 transition-all duration-200"
                  onClick={() => onRelease()}
                >
                  <X className="w-3.5 h-3.5" />
                  Release
                </motion.button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Draw Rewards Card */}
      <motion.div
        whileHover={{ scale: 1.01, y: -2 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="obsidian rounded-xl p-5 relative overflow-hidden group"
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-300/20 to-transparent" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-purple-300/60" />
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Draw Rewards</p>
          </div>
          <div className="space-y-2">
            {Object.entries(RARITY).map(([key, data]) => (
              <motion.div
                key={key}
                whileHover={{ x: 2 }}
                className="flex items-center justify-between text-[11px] font-mono py-1.5 px-2 rounded-md hover:bg-white/[0.02] transition-colors"
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
