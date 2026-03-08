import { useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Star, Crosshair, Code as Code2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { RARITY, DIFF_COLORS, RarityBadge } from '@/components/DrawAnimation';

const RARITY_BORDER = {
  common: 'group-hover:border-zinc-500/30',
  rare: 'group-hover:border-blue-400/40',
  epic: 'group-hover:border-purple-500/40',
  legendary: 'group-hover:border-amber-400/50',
};

const RARITY_GLOW = {
  common: 'group-hover:shadow-[0_4px_20px_-4px_rgba(161,161,170,0.1)]',
  rare: 'group-hover:shadow-[0_4px_24px_-4px_rgba(96,165,250,0.2)]',
  epic: 'group-hover:shadow-[0_4px_28px_-4px_rgba(168,85,247,0.25)]',
  legendary: 'group-hover:shadow-[0_6px_32px_-4px_rgba(251,191,36,0.3)]',
};

const RARITY_ACCENT = {
  common: 'rgba(161,161,170,0.5)',
  rare: 'rgba(96,165,250,0.6)',
  epic: 'rgba(168,85,247,0.6)',
  legendary: 'rgba(251,191,36,0.7)',
};

export default function IssueCardRow({ issue, onChoose, choosingIssueId }) {
  const r = RARITY[issue.rarity] || RARITY.common;
  const isChoosing = choosingIssueId === issue.id;
  const cardRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -3;
    const rotateY = ((x - centerX) / centerX) * 4;
    card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.01)`;
    card.style.setProperty('--mouse-x', `${(x / rect.width) * 100}%`);
    card.style.setProperty('--mouse-y', `${(y / rect.height) * 100}%`);
  }, []);

  const handleMouseLeave = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)';
  }, []);

  return (
    <div
      ref={cardRef}
      data-testid="issue-card-row"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`tilt-card group relative overflow-hidden rounded-xl border bg-gradient-to-br from-zinc-950/80 to-zinc-900/40 backdrop-blur-sm ${RARITY_BORDER[issue.rarity]} ${RARITY_GLOW[issue.rarity]}`}
      style={{
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${RARITY_ACCENT[issue.rarity]}, transparent 40%)`,
        }}
      />

      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative flex items-center gap-4 px-5 py-4">
        <div className="flex-shrink-0">
          <motion.div
            whileHover={{ scale: 1.15, rotate: 5 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
            className="relative"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center border transition-all duration-300"
              style={{
                background: `${r.accent}0.08)`,
                borderColor: `${r.accent}0.2)`,
                boxShadow: `0 0 12px -4px ${r.accent}0.15)`,
              }}
            >
              <Code2 className="w-4 h-4" style={{ color: `${r.accent}0.9)` }} />
            </div>
            <div
              className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                boxShadow: `0 0 0 2px ${r.accent}0.3), 0 0 12px 2px ${r.accent}0.15)`,
              }}
            />
          </motion.div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] text-zinc-500 font-mono truncate group-hover:text-zinc-400 transition-colors">
              {issue.repo}
            </span>
            <RarityBadge rarity={issue.rarity} />
          </div>
          <h3 className="text-sm font-medium text-zinc-200 group-hover:text-white leading-snug mb-2 transition-colors line-clamp-1">
            {issue.title}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {(issue.labels || []).slice(0, 3).map((label) => (
              <motion.span
                key={label}
                whileHover={{ scale: 1.08, y: -1 }}
                className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-900/80 border border-white/[0.08] text-zinc-400 font-mono truncate max-w-[120px] hover:border-white/20 hover:text-zinc-300 transition-colors"
              >
                {label}
              </motion.span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="hidden lg:flex items-center gap-3">
            <span className="text-xs px-2.5 py-1 rounded-md bg-sky-300/[0.08] text-sky-200 border border-sky-300/20 font-mono">
              {issue.language}
            </span>
            <Badge
              variant="outline"
              className={`text-xs ${DIFF_COLORS[issue.difficulty] || ''}`}
            >
              {issue.difficulty}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 min-w-[60px] justify-end">
            <Star className="w-3.5 h-3.5 text-sky-300/60" strokeWidth={1.5} fill="rgba(125,211,252,0.1)" />
            <span className="text-xs text-zinc-400 font-mono tabular-nums">
              {issue.stars >= 1000 ? `${(issue.stars / 1000).toFixed(1)}k` : issue.stars}
            </span>
          </div>

          <div className="flex gap-2">
            <motion.a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.1, y: -2 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 hover:border-white/20 transition-all duration-200"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </motion.a>
            <motion.button
              data-testid="issue-choose-button"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              className="rune-btn px-4 py-2 rounded-lg text-[11px] flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isChoosing}
              onClick={() => onChoose(issue.id)}
            >
              <Crosshair className="w-3.5 h-3.5" />
              {isChoosing ? 'Choosing...' : 'Choose'}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
