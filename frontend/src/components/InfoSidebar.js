import { Bookmark, ExternalLink, Clock, X, Send, CheckCircle2 } from 'lucide-react';
import { RarityBadge } from '@/components/DrawAnimation';

export default function InfoSidebar({ redrawsRemaining, activeBookmark, onSubmitPR, onVerify, onRelease, getCountdown }) {
  return (
    <div data-testid="info-sidebar" className="obsidian rounded-xl p-4 w-56 flex-shrink-0 space-y-5">
      {/* Draw Budget */}
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-1.5">Draw Budget</p>
        <p className="text-lg font-semibold text-sky-100">{redrawsRemaining} left today</p>
      </div>

      <div className="h-px bg-white/5" />

      {/* Bookmark */}
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-1.5">Bookmark</p>
        {!activeBookmark ? (
          <p className="text-sm text-zinc-300">Open slot</p>
        ) : (
          <div className="space-y-2">
            <RarityBadge rarity={activeBookmark.rarity} />
            <p className="text-xs font-mono text-zinc-500 truncate">{activeBookmark.repo}</p>
            <p className="text-sm text-zinc-300 line-clamp-2">{activeBookmark.title}</p>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
              <Clock className="w-3 h-3" strokeWidth={1.5} />
              {getCountdown(activeBookmark.expires_at)}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-1.5 pt-1">
              {activeBookmark.status === 'bookmarked' && (
                <button
                  data-testid="submit-pr-button"
                  className="rune-btn px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider w-full text-left inline-flex items-center"
                  onClick={() => onSubmitPR(activeBookmark.id)}
                >
                  <Send className="w-3 h-3 mr-1.5 flex-shrink-0" />Submit PR
                </button>
              )}
              {activeBookmark.status === 'pr_submitted' && (
                <button
                  data-testid="verify-pr-button"
                  className="px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono uppercase tracking-wider w-full text-left inline-flex items-center shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_-5px_rgba(16,185,129,0.5)] hover:bg-emerald-500/20"
                  style={{ transition: 'background-color 0.2s, box-shadow 0.2s' }}
                  onClick={() => onVerify(activeBookmark.id)}
                >
                  <CheckCircle2 className="w-3 h-3 mr-1.5 flex-shrink-0" />Verify
                </button>
              )}
              <a
                data-testid="bookmark-github-link"
                href={activeBookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-md text-zinc-400 hover:text-white text-xs font-mono uppercase tracking-wider hover:bg-white/5 border border-white/5 hover:border-white/10 inline-flex items-center"
                style={{ transition: 'color 0.2s, background-color 0.2s, border-color 0.2s' }}
              >
                <ExternalLink className="w-3 h-3 mr-1.5 flex-shrink-0" />GitHub
              </a>
              <button
                data-testid="release-bookmark-button"
                className="px-3 py-1.5 rounded-md text-zinc-600 hover:text-red-400 text-xs font-mono uppercase tracking-wider hover:bg-red-500/5 w-full text-left inline-flex items-center"
                style={{ transition: 'color 0.2s, background-color 0.2s' }}
                onClick={() => onRelease()}
              >
                <X className="w-3 h-3 mr-1.5 flex-shrink-0" />Release
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="h-px bg-white/5" />

      {/* Draw Rewards */}
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-2">Draw Rewards</p>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono"><span className="text-zinc-500">Common</span><span className="text-zinc-400">+5 XP</span></div>
          <div className="flex justify-between text-[10px] font-mono"><span className="text-blue-400/70">Rare</span><span className="text-blue-400">+15 XP</span></div>
          <div className="flex justify-between text-[10px] font-mono"><span className="text-purple-400/70">Epic</span><span className="text-purple-400">+30 XP</span></div>
          <div className="flex justify-between text-[10px] font-mono"><span className="text-amber-400/70">Legendary</span><span className="text-amber-400">+50 XP</span></div>
        </div>
      </div>
    </div>
  );
}
