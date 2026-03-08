import { ExternalLink, Star, Crosshair, GitFork } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { RARITY, DIFF_COLORS, RarityBadge } from '@/components/DrawAnimation';
import { motion } from 'framer-motion';

const RARITY_BORDER = {
  common: 'border-zinc-800/50 hover:border-zinc-700/60',
  rare: 'border-blue-500/20 hover:border-blue-400/35',
  epic: 'border-purple-500/20 hover:border-purple-400/35',
  legendary: 'border-amber-500/25 hover:border-amber-400/40',
};

const RARITY_GLOW = {
  common: '',
  rare: 'hover:shadow-[0_0_20px_-6px_rgba(96,165,250,0.2)]',
  epic: 'hover:shadow-[0_0_24px_-6px_rgba(168,85,247,0.25)]',
  legendary: 'hover:shadow-[0_0_30px_-6px_rgba(251,191,36,0.3)]',
};

const RARITY_STRIPE = {
  common: 'bg-zinc-600/40',
  rare: 'bg-blue-400/60',
  epic: 'bg-purple-500/70',
  legendary: 'bg-gradient-to-b from-amber-400/80 to-amber-500/80',
};

export default function IssueCardRow({ issue, onChoose, choosingIssueId, index = 0 }) {
  const r = RARITY[issue.rarity] || RARITY.common;
  const isChoosing = choosingIssueId === issue.id;
  const RarityIcon = r.icon;

  return (
    <motion.div
      data-testid="issue-card-row"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.35, 
        delay: Math.min(index * 0.03, 0.3),
        ease: [0.22, 1, 0.36, 1]
      }}
      className={`
        group relative flex items-center gap-4 px-5 py-4 rounded-xl
        bg-zinc-950/40 backdrop-blur-sm
        border ${RARITY_BORDER[issue.rarity]}
        ${RARITY_GLOW[issue.rarity]}
        transition-all duration-300 ease-out
        hover:bg-zinc-900/50
      `}
    >
      {/* Rarity stripe indicator */}
      <div className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full ${RARITY_STRIPE[issue.rarity]}`} />

      {/* Main content */}
      <div className="flex-1 min-w-0 pl-3">
        {/* Top row: repo + rarity */}
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="flex items-center gap-1.5 text-zinc-500">
            <GitFork className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="text-[11px] font-mono truncate max-w-[200px]">{issue.repo}</span>
          </div>
          <RarityBadge rarity={issue.rarity} />
        </div>

        {/* Title */}
        <p className="text-sm text-zinc-100 leading-relaxed line-clamp-1 group-hover:text-white transition-colors">
          {issue.title}
        </p>

        {/* Labels */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {(issue.labels || []).slice(0, 3).map((label) => (
            <span
              key={label}
              className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-900/80 border border-zinc-800/60 text-zinc-400 font-mono truncate max-w-[140px] transition-colors group-hover:border-zinc-700/60"
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Right side: metadata + actions */}
      <div className="flex items-center gap-4 flex-shrink-0">
        {/* Language badge */}
        <span className="text-[11px] px-2.5 py-1 rounded-md bg-sky-500/10 text-sky-200 border border-sky-500/20 font-mono hidden sm:inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400/70" />
          {issue.language}
        </span>

        {/* Difficulty badge */}
        <Badge
          variant="outline"
          className={`text-[11px] hidden md:inline-flex ${DIFF_COLORS[issue.difficulty] || ''}`}
        >
          {issue.difficulty}
        </Badge>

        {/* Stars */}
        <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-xs w-16 justify-end">
          <Star className="w-3.5 h-3.5 text-amber-400/60" strokeWidth={1.5} />
          <span>{issue.stars >= 1000 ? `${(issue.stars / 1000).toFixed(1)}k` : issue.stars}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <a
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600 hover:bg-zinc-800/50 transition-all duration-200"
            title="View on GitHub"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            data-testid="issue-choose-button"
            className={`
              flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider
              transition-all duration-200
              ${isChoosing 
                ? 'bg-sky-500/20 border-sky-400/40 text-sky-300 cursor-wait' 
                : 'bg-sky-500/10 border border-sky-500/30 text-sky-200 hover:bg-sky-500/20 hover:border-sky-400/50 hover:shadow-[0_0_20px_-4px_rgba(14,165,233,0.4)]'
              }
            `}
            disabled={isChoosing}
            onClick={() => onChoose(issue.id)}
          >
            <Crosshair className="w-3.5 h-3.5" />
            {isChoosing ? 'Choosing...' : 'Choose'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
