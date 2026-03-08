import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import {
  Bookmark, ExternalLink, Star, FolderGit2,
  Gem, Crown, Sparkles, Zap,
  BookOpen, RotateCcw, Shuffle,
} from 'lucide-react';

// ─── Shared Constants ──────────────────────────────────────────

export const RARITY = {
  common:    { label: 'Common',    icon: null,     color: 'zinc',   accent: 'rgba(161,161,170,', drawXP: 5,  mergeXP: 75,  browseMergeXP: 25 },
  rare:      { label: 'Rare',      icon: Gem,      color: 'blue',   accent: 'rgba(96,165,250,',  drawXP: 15, mergeXP: 150, browseMergeXP: 50 },
  epic:      { label: 'Epic',      icon: Sparkles, color: 'purple', accent: 'rgba(168,85,247,',  drawXP: 30, mergeXP: 300, browseMergeXP: 100 },
  legendary: { label: 'Legendary', icon: Crown,    color: 'amber',  accent: 'rgba(251,191,36,',  drawXP: 50, mergeXP: 500, browseMergeXP: 0 },
};

export const DIFF_COLORS = {
  Beginner: 'bg-sky-300/10 text-sky-200 border-sky-300/20',
  Intermediate: 'bg-slate-300/10 text-slate-200 border-slate-300/20',
  Advanced: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export function RarityBadge({ rarity, size = 'default' }) {
  const r = RARITY[rarity] || RARITY.common;
  const Icon = r.icon;
  const sizeClasses = size === 'sm' 
    ? 'text-[9px] px-1.5 py-0.5 gap-0.5' 
    : 'text-[10px] px-2 py-0.5 gap-1';
  const iconSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';
  
  return (
    <span className={`rarity-badge rarity-badge-${rarity || 'common'} inline-flex items-center ${sizeClasses}`}>
      {Icon && <Icon className={iconSize} strokeWidth={2} />}
      {r.label}
    </span>
  );
}

// ─── DrawAnimation Component ─────────────────────────────────

export default function DrawAnimation({
  state,
  issue,
  onDraw,
  onBookmark,
  onRedraw,
  xpAwarded,
  drawSource,
  redrawsRemaining,
}) {
  const rarity = issue?.rarity || 'common';
  const r = RARITY[rarity];
  const Icon = r.icon;

  // FIFA-style phases: idle -> flares -> drop -> infoFlash -> flip -> settle
  const [phase, setPhase] = useState('idle');
  const [flashIndex, setFlashIndex] = useState(-1);
  const timers = useRef([]);
  const flameOffsets = useRef([]);

  const FLARE = {
    common:    { color: 'rgba(161,161,170,', intensity: 0.3, flames: 4 },
    rare:      { color: 'rgba(96,165,250,',  intensity: 0.5, flames: 5 },
    epic:      { color: 'rgba(168,85,247,',  intensity: 0.7, flames: 6 },
    legendary: { color: 'rgba(251,191,36,',  intensity: 0.9, flames: 6 },
  };

  const f = FLARE[rarity] || FLARE.common;

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  useEffect(() => {
    clearTimers();
    if (state === 'shuffling') {
      setPhase('idle'); // stay on idle card during shuffling wait
    } else if (state === 'revealed') {
      // Pre-generate flame positions spread across bottom
      flameOffsets.current = Array.from({ length: f.flames }, (_, i) => ({
        x: ((i + 0.5) / f.flames) * 100,
        delay: i * 0.05,
        height: 70 + Math.random() * 50,
      }));
      // Flares shoot up
      setPhase('flares');
      // Card drops from top (face-down) — give flares time to rise
      timers.current.push(setTimeout(() => setPhase('drop'), 700));
      // Info flashes — each gets 400ms to breathe
      timers.current.push(setTimeout(() => { setPhase('infoFlash'); setFlashIndex(0); }, 1400));
      timers.current.push(setTimeout(() => setFlashIndex(1), 1800));
      timers.current.push(setTimeout(() => setFlashIndex(2), 2200));
      // Card flips to reveal
      timers.current.push(setTimeout(() => setPhase('flip'), 2700));
      // Settle
      timers.current.push(setTimeout(() => setPhase('settle'), 3400));
    } else {
      setPhase('idle');
      setFlashIndex(-1);
    }
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, f.flames]);

  const showFlares = phase === 'flares' || phase === 'drop' || phase === 'infoFlash' || phase === 'flip';
  const showCard = phase === 'drop' || phase === 'infoFlash' || phase === 'flip' || phase === 'settle';

  // Info flash items (adapted from FIFA's flag/league/club)
  const flashItems = issue ? [
    { label: issue.language, sub: 'Language' },
    { label: r.label, sub: 'Rarity' },
    { label: issue.repo, sub: 'Repository' },
  ] : [];

  // Merge XP depends on draw source
  const mergeXP = drawSource === 'choose' ? r.browseMergeXP : r.mergeXP;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-80 h-[440px] mb-8">

        {/* ── Spotlight Beams ── */}
        {showFlares && (
          <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden rounded-xl">
            <motion.div
              className="absolute inset-0"
              style={{ background: 'rgba(0,0,0,0.7)' }}
              animate={{ opacity: phase === 'flip' ? 0 : 1 }}
              transition={{ duration: 0.5 }}
            />
            {/* Left beam */}
            <motion.div
              className="absolute bottom-0 left-0"
              style={{
                width: 80,
                height: '140%',
                background: `linear-gradient(to top, ${f.color}${f.intensity * 0.3}), ${f.color}${f.intensity * 0.08}) 40%, transparent 80%)`,
                filter: 'blur(8px)',
                transformOrigin: 'bottom left',
              }}
              initial={{ rotate: -40, opacity: 0, scaleY: 0.5 }}
              animate={{
                rotate: phase === 'flip' ? -10 : [-40, -8, -12],
                opacity: phase === 'flip' ? 0 : [0, 0.9, 0.7],
                scaleY: 1,
              }}
              transition={{
                rotate: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
                opacity: phase === 'flip' ? { duration: 0.5 } : { duration: 0.6 },
                scaleY: { duration: 0.4 },
              }}
            />
            {/* Right beam */}
            <motion.div
              className="absolute bottom-0 right-0"
              style={{
                width: 80,
                height: '140%',
                background: `linear-gradient(to top, ${f.color}${f.intensity * 0.3}), ${f.color}${f.intensity * 0.08}) 40%, transparent 80%)`,
                filter: 'blur(8px)',
                transformOrigin: 'bottom right',
              }}
              initial={{ rotate: 40, opacity: 0, scaleY: 0.5 }}
              animate={{
                rotate: phase === 'flip' ? 10 : [40, 8, 12],
                opacity: phase === 'flip' ? 0 : [0, 0.9, 0.7],
                scaleY: 1,
              }}
              transition={{
                rotate: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
                opacity: phase === 'flip' ? { duration: 0.5 } : { duration: 0.6 },
                scaleY: { duration: 0.4 },
              }}
            />
            {/* Center convergence glow */}
            <motion.div
              className="absolute bottom-0 left-1/2 -translate-x-1/2"
              style={{
                width: 60,
                height: '120%',
                background: `radial-gradient(ellipse at 50% 80%, ${f.color}${f.intensity * 0.4}), transparent 60%)`,
                filter: 'blur(20px)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: phase === 'flip' ? 0 : [0, 0.8, 0.5, 0.7] }}
              transition={{
                duration: 1.2,
                delay: 0.4,
                opacity: phase === 'flip' ? { duration: 0.5 } : undefined,
              }}
            />
            {/* Lens flare at convergence */}
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 rounded-full"
              style={{
                bottom: '55%',
                width: 20, height: 20,
                background: `radial-gradient(circle, ${f.color}0.6), transparent 70%)`,
                filter: 'blur(4px)',
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: phase === 'flip' ? 0 : [0, 1, 0.6],
                scale: phase === 'flip' ? 0 : [0, 1.5, 1],
              }}
              transition={{ duration: 0.4, delay: 0.5 }}
            />
          </div>
        )}

        {/* ── Info Flash — rapid text flashes (FIFA flag/league/club style) ── */}
        {phase === 'infoFlash' && (
          <>
            {/* Blur backdrop over the card */}
            <motion.div
              className="absolute inset-0 z-[5] rounded-xl"
              style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.4)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            />
            <div className="absolute inset-0 z-[6] flex items-center justify-center pointer-events-none">
              {flashItems.map((item, idx) => (
                flashIndex === idx && (
                  <motion.div
                    key={idx}
                    className="text-center"
                    initial={{ opacity: 0, scale: 1.4, y: 10 }}
                    animate={{ opacity: [0, 1, 1, 0.8], scale: [1.4, 1, 1, 0.97], y: [10, 0, 0, -5] }}
                    transition={{ duration: 0.4, times: [0, 0.2, 0.75, 1], ease: [0.22, 1, 0.36, 1] }}
                  >
                    <p className="text-2xl font-bold tracking-tight" style={{ color: `${f.color}0.9)` }}>
                      {item.label}
                    </p>
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mt-1.5">{item.sub}</p>
                  </motion.div>
                )
              ))}
            </div>
          </>
        )}

        {/* ── The Card ── */}
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 5 }}>
          {/* Idle card */}
          {phase === 'idle' && (
            <div
              className="w-80 h-[440px] rounded-lg flex items-center justify-center overflow-hidden"
              style={{ background: 'rgba(9,9,11,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-300/20 to-transparent" />
              <div className="text-center">
                <BookOpen className="w-10 h-10 text-sky-300/25 mx-auto mb-3" strokeWidth={1} />
                <p className="text-sm text-sky-100/35 font-[Satoshi]">GitFable</p>
              </div>
            </div>
          )}

          {/* Card drop (face-down) + flip to reveal */}
          {showCard && issue && (
            <motion.div
              className="w-80 h-[440px] rounded-lg overflow-hidden absolute"
              style={{
                background: 'rgba(9,9,11,0.92)',
                border: (phase === 'flip' || phase === 'settle')
                  ? `1px solid ${r.accent}0.35)`
                  : '1px solid rgba(255,255,255,0.08)',
                boxShadow: phase === 'settle'
                  ? `0 0 30px -8px ${r.accent}0.3)`
                  : '0 8px 30px rgba(0, 0, 0, 0.5)',
                perspective: 800,
              }}
              initial={{ y: -500, rotateX: 15, scale: 0.9, opacity: 0 }}
              animate={
                phase === 'drop' || phase === 'infoFlash'
                  ? { y: 0, rotateX: 0, scale: 1, opacity: 1 }
                  : phase === 'flip'
                  ? { y: 0, rotateX: 0, scale: [1, 1.08, 1.03], opacity: 1 }
                  : { y: 0, rotateX: 0, scale: 1.03, opacity: 1 }
              }
              transition={
                phase === 'drop' || phase === 'infoFlash'
                  ? { duration: 0.45, ease: [0.16, 1, 0.3, 1] }
                  : phase === 'flip'
                  ? { scale: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }
                  : { duration: 0.3 }
              }
            >
              {/* Top rarity line */}
              {(phase === 'flip' || phase === 'settle') && (
                <div className={`absolute top-0 left-0 right-0 h-px rarity-line-${rarity}`} />
              )}

              {/* Face-down state: card back (hidden during infoFlash — only flash text shows) */}
              {phase === 'drop' && (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="absolute inset-3 rounded-md border border-white/[0.04]" />
                  <div className="text-center">
                    <BookOpen className="w-8 h-8 text-sky-300/20 mx-auto mb-2" strokeWidth={1} />
                    <p className="font-mono text-[10px] text-sky-200/30 uppercase tracking-[0.2em]">GitFable</p>
                  </div>
                </div>
              )}
              {phase === 'infoFlash' && (
                <div className="w-full h-full" />
              )}

              {/* Face-up: revealed content */}
              {(phase === 'flip' || phase === 'settle') && (
                <>
                  {/* Flash overlay on flip */}
                  {phase === 'flip' && (
                    <motion.div
                      className="absolute inset-0 pointer-events-none z-20"
                      style={{ background: `${r.accent}0.25)` }}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0 }}
                      transition={{ duration: 0.6 }}
                    />
                  )}

                  {/* Shimmer sweep */}
                  <div
                    className="absolute inset-0 pointer-events-none shimmer-sweep z-10"
                    style={{
                      background: `linear-gradient(105deg, transparent 40%, ${f.color}${f.intensity * 0.2}) 50%, transparent 60%)`,
                      backgroundSize: '250% 100%',
                    }}
                  />

                  {/* Content with staggered reveal */}
                  <div className="p-6 w-full h-full flex flex-col items-center justify-center relative z-10">
                    <motion.div
                      className="flex items-center gap-2 text-xs text-zinc-500 font-mono mb-3"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.05 }}
                    >
                      <FolderGit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      <span>{issue.repo}</span>
                    </motion.div>
                    <motion.div
                      className="mb-3"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.08 }}
                    >
                      <RarityBadge rarity={rarity} />
                    </motion.div>
                    <motion.h3
                      className="font-semibold text-xl leading-snug text-zinc-100 text-center mb-6"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.12 }}
                    >{issue.title}</motion.h3>
                    <motion.div
                      className="flex flex-col items-center gap-3"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.2 }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-sky-300/10 text-sky-100 border border-sky-300/20 font-mono">{issue.language}</span>
                        <Badge variant="outline" className={`text-xs ${DIFF_COLORS[issue.difficulty] || ''}`}>{issue.difficulty}</Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-zinc-500 font-mono">
                        <Star className="w-3.5 h-3.5 text-sky-300/70" strokeWidth={1.5} />{issue.stars?.toLocaleString()}
                      </div>
                    </motion.div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Draw Controls ── */}
      <div className="flex flex-col items-center gap-3">
        {state === 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-3"
          >
            <button
              data-testid="draw-button"
              onClick={onDraw}
              className="group relative px-10 py-4 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-100 font-bold text-sm uppercase tracking-wider hover:bg-sky-500/20 hover:border-sky-400/50 hover:shadow-[0_0_30px_-6px_rgba(14,165,233,0.5)] transition-all duration-300"
            >
              <span className="relative z-10 flex items-center gap-2">
                <Shuffle className="w-4 h-4" />
                Draw Issue
              </span>
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-sky-500/0 via-sky-400/10 to-sky-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            {redrawsRemaining != null && (
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
                {redrawsRemaining} draw{redrawsRemaining !== 1 ? 's' : ''} remaining today
              </p>
            )}
          </motion.div>
        )}
        {state === 'shuffling' && (
          <p className="font-mono text-xs text-sky-200 uppercase tracking-widest animate-pulse">Drawing...</p>
        )}
        {state === 'revealed' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-4"
          >
            {/* XP capsule */}
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-5 px-6 py-4 rounded-2xl border backdrop-blur-sm"
              style={{
                background: `${r.accent}0.08)`,
                borderColor: `${r.accent}0.3)`,
                boxShadow: `0 0 30px -8px ${r.accent}0.35)`,
              }}
            >
              {Icon && <Icon className="w-6 h-6" style={{ color: `${r.accent}0.85)` }} />}
              <div className="flex flex-col">
                <span className="text-base font-bold font-mono" style={{ color: `${r.accent}0.95)` }}>
                  +{xpAwarded != null ? xpAwarded : r.drawXP} XP
                </span>
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Draw reward</span>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="flex flex-col">
                <span className="text-base font-bold font-mono" style={{ color: `${r.accent}0.95)` }}>
                  +{mergeXP} XP
                </span>
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">On merge</span>
              </div>
            </motion.div>

            {/* Action buttons */}
            <motion.div 
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="flex items-center gap-1"
            >
              <button
                data-testid="bookmark-button"
                onClick={onBookmark}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-zinc-300 hover:text-sky-200 hover:bg-sky-500/10 font-mono uppercase tracking-wider transition-all"
              >
                <Bookmark className="w-3.5 h-3.5" />Bookmark
              </button>
              <button
                data-testid="redraw-button"
                onClick={onRedraw}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 font-mono uppercase tracking-wider transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />Redraw
              </button>
              <a
                data-testid="view-github-button"
                href={issue?.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 font-mono uppercase tracking-wider transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />GitHub
              </a>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
