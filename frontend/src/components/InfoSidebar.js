import { Bookmark, ExternalLink, Clock, X, Send, CheckCircle2, Zap, Gem, Sparkles, Crown } from 'lucide-react';
import { RarityBadge, RARITY } from '@/components/DrawAnimation';
import { motion } from 'framer-motion';

const RARITY_INFO = [
  { key: 'common', label: 'Common', xp: 5, color: 'text-zinc-400', bg: 'bg-zinc-500/10' },
  { key: 'rare', label: 'Rare', xp: 15, color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Gem },
  { key: 'epic', label: 'Epic', xp: 30, color: 'text-purple-400', bg: 'bg-purple-500/10', icon: Sparkles },
  { key: 'legendary', label: 'Legendary', xp: 50, color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Crown },
];

export default function InfoSidebar({ redrawsRemaining, activeBookmark, onSubmitPR, onVerify, onRelease, getCountdown }) {
  return (
    <motion.div 
      data-testid="info-sidebar" 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="glass-card rounded-2xl p-5 w-60 flex-shrink-0 space-y-5"
    >
      {/* Draw Budget */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-lg bg-sky-500/10 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-sky-400" strokeWidth={2} />
          </div>
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500">Draw Budget</p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold text-white tabular-nums">{redrawsRemaining}</span>
          <span className="text-sm text-zinc-500">left today</span>
        </div>
        <div className="mt-2 h-1.5 bg-zinc-900 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-sky-500 to-sky-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${(redrawsRemaining / 3) * 100}%` }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      <div className="section-divider" />

      {/* Active Bookmark */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Bookmark className="w-3.5 h-3.5 text-amber-400" strokeWidth={2} />
          </div>
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500">Bookmark</p>
        </div>
        
        {!activeBookmark ? (
          <div className="py-4 px-3 rounded-xl border border-dashed border-zinc-800 text-center">
            <p className="text-sm text-zinc-500">No active bookmark</p>
            <p className="text-[10px] text-zinc-600 mt-1">Draw an issue to claim a slot</p>
          </div>
        ) : (
          <div className="space-y-3">
            <RarityBadge rarity={activeBookmark.rarity} />
            <p className="text-[11px] font-mono text-zinc-500 truncate">{activeBookmark.repo}</p>
            <p className="text-sm text-zinc-200 line-clamp-2 leading-relaxed">{activeBookmark.title}</p>
            
            {/* Countdown */}
            <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-zinc-900/60 border border-zinc-800/50">
              <Clock className="w-3.5 h-3.5 text-zinc-500" strokeWidth={1.5} />
              <span className="text-xs font-mono text-zinc-400">{getCountdown(activeBookmark.expires_at)}</span>
              <span className="text-[10px] text-zinc-600">remaining</span>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-1">
              {activeBookmark.status === 'bookmarked' && (
                <button
                  data-testid="submit-pr-button"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-200 text-xs font-semibold uppercase tracking-wider hover:bg-sky-500/20 hover:border-sky-400/50 transition-all duration-200"
                  onClick={() => onSubmitPR(activeBookmark.id)}
                >
                  <Send className="w-3.5 h-3.5" />
                  Submit PR
                </button>
              )}
              {activeBookmark.status === 'pr_submitted' && (
                <button
                  data-testid="verify-pr-button"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider hover:bg-emerald-500/20 hover:border-emerald-400/40 hover:shadow-[0_0_20px_-4px_rgba(16,185,129,0.3)] transition-all duration-200"
                  onClick={() => onVerify(activeBookmark.id)}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Verify Merge
                </button>
              )}
              <div className="flex gap-2">
                <a
                  data-testid="bookmark-github-link"
                  href={activeBookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-zinc-400 hover:text-white text-xs font-mono hover:bg-zinc-800/60 border border-zinc-800 hover:border-zinc-700 transition-all duration-200"
                >
                  <ExternalLink className="w-3 h-3" />
                  GitHub
                </a>
                <button
                  data-testid="release-bookmark-button"
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-zinc-500 hover:text-red-400 text-xs font-mono hover:bg-red-500/10 border border-zinc-800 hover:border-red-500/30 transition-all duration-200"
                  onClick={() => onRelease()}
                  title="Release bookmark"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="section-divider" />

      {/* Draw Rewards */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" strokeWidth={2} />
          </div>
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500">Draw Rewards</p>
        </div>
        <div className="space-y-1.5">
          {RARITY_INFO.map(({ key, label, xp, color, bg, icon: Icon }) => (
            <div 
              key={key} 
              className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-zinc-900/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                {Icon && <Icon className={`w-3 h-3 ${color}`} strokeWidth={2} />}
                {!Icon && <span className="w-3 h-3" />}
                <span className={`text-[11px] font-mono ${color}`}>{label}</span>
              </div>
              <span className={`text-xs font-semibold ${color}`}>+{xp} XP</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
