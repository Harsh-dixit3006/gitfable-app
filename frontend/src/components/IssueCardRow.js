import { ExternalLink, Star, Crosshair } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { RARITY, DIFF_COLORS, RarityBadge } from '@/components/DrawAnimation';

const RARITY_STRIPE = {
  common: 'bg-zinc-500/30',
  rare: 'bg-blue-400/50',
  epic: 'bg-purple-500/50',
  legendary: 'bg-amber-400/60',
};

const RARITY_HOVER_GLOW = {
  common: '',
  rare: 'hover:shadow-[0_0_15px_-4px_rgba(96,165,250,0.15)]',
  epic: 'hover:shadow-[0_0_20px_-4px_rgba(168,85,247,0.2)]',
  legendary: 'hover:shadow-[0_0_25px_-4px_rgba(251,191,36,0.25)]',
};

export default function IssueCardRow({ issue, onChoose, choosingIssueId }) {
  const r = RARITY[issue.rarity] || RARITY.common;
  const isChoosing = choosingIssueId === issue.id;

  return (
    <div
      data-testid="issue-card-row"
      className={`group relative flex items-center gap-4 px-4 py-3 rounded-lg border border-white/[0.05] hover:border-white/[0.1] hover:bg-white/[0.02] transition-all duration-200 ${RARITY_HOVER_GLOW[issue.rarity]}`}
    >
      {/* Rarity stripe */}
      <div className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-full ${RARITY_STRIPE[issue.rarity]}`} />

      {/* Main content */}
      <div className="flex-1 min-w-0 pl-2">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[11px] text-zinc-500 font-mono truncate">{issue.repo}</span>
          <RarityBadge rarity={issue.rarity} />
        </div>
        <p className="text-sm text-zinc-200 leading-snug truncate">{issue.title}</p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {(issue.labels || []).slice(0, 2).map((label) => (
            <span
              key={label}
              className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 text-zinc-500 font-mono truncate max-w-[120px]"
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Right side badges */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-xs px-2 py-0.5 rounded bg-sky-300/10 text-sky-100 border border-sky-300/20 font-mono hidden sm:inline">
          {issue.language}
        </span>
        <Badge
          variant="outline"
          className={`text-xs hidden md:inline-flex ${DIFF_COLORS[issue.difficulty] || ''}`}
        >
          {issue.difficulty}
        </Badge>
        <span className="text-xs text-zinc-400 font-mono flex items-center gap-1 w-16 justify-end">
          <Star className="w-3 h-3 text-sky-300/50" strokeWidth={1.5} />
          {issue.stars >= 1000 ? `${(issue.stars / 1000).toFixed(0)}k` : issue.stars}
        </span>
        <div className="flex gap-2">
          <a
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-md border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 text-xs font-mono transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            data-testid="issue-choose-button"
            className="rune-btn px-3 py-1.5 rounded-md text-[10px]"
            disabled={isChoosing}
            onClick={() => onChoose(issue.id)}
          >
            <Crosshair className="w-3 h-3 inline mr-1" />
            {isChoosing ? 'Choosing...' : 'Choose'}
          </button>
        </div>
      </div>
    </div>
  );
}
