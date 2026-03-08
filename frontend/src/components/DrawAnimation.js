import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import {
  Bookmark, ExternalLink, Star, FolderGit2,
  Zap, BookOpen, RotateCcw, Shuffle,
} from 'lucide-react';
import { colors, accent, RARITY, DIFF_COLORS } from '@/lib/theme';

export { RARITY, DIFF_COLORS };

export function RarityBadge({ rarity }) {
  const r = RARITY[rarity] || RARITY.common;
  const Icon = r.icon;
  return (
    <span className={`rarity-badge rarity-badge-${rarity || 'common'} inline-flex items-center gap-1`}>
      {Icon && <Icon className="w-3 h-3" strokeWidth={2} />}
      {r.label}
    </span>
  );
}

function SparkBurst({ color, count = 16 }) {
  const sparks = useRef(
    Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 200,
      y: (Math.random() - 0.5) * 200 - 40,
      size: 2 + Math.random() * 4,
      delay: Math.random() * 0.3,
    }))
  );

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-visible">
      {sparks.current.map((s, i) => (
        <div
          key={i}
          className="spark"
          style={{
            left: '50%',
            top: '50%',
            width: s.size,
            height: s.size,
            background: color,
            boxShadow: `0 0 6px 2px ${color}`,
            '--spark-x': `${s.x}px`,
            '--spark-y': `${s.y}px`,
            '--spark-delay': `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function RadialBurst({ color }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 overflow-hidden">
      <div
        className="radial-burst rounded-full"
        style={{
          width: 120,
          height: 120,
          background: `radial-gradient(circle, ${color}, transparent 70%)`,
        }}
      />
    </div>
  );
}

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

  const [phase, setPhase] = useState('idle');
  const [flashIndex, setFlashIndex] = useState(-1);
  const [showBurst, setShowBurst] = useState(false);
  const [shaking, setShaking] = useState(false);
  const timers = useRef([]);
  const flameOffsets = useRef([]);
  const containerRef = useRef(null);

  const FLARE = {
    common:    { color: `rgba(${colors.common.rgb},`,    intensity: 0.3, flames: 4 },
    rare:      { color: `rgba(${colors.rare.rgb},`,      intensity: 0.5, flames: 5 },
    epic:      { color: `rgba(${colors.epic.rgb},`,      intensity: 0.7, flames: 6 },
    legendary: { color: `rgba(${colors.legendary.rgb},`, intensity: 0.9, flames: 6 },
  };

  const f = FLARE[rarity] || FLARE.common;

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  useEffect(() => {
    clearTimers();
    setShowBurst(false);
    setShaking(false);
    if (state === 'shuffling') {
      setPhase('idle');
    } else if (state === 'revealed') {
      flameOffsets.current = Array.from({ length: f.flames }, (_, i) => ({
        x: ((i + 0.5) / f.flames) * 100,
        delay: i * 0.05,
        height: 70 + Math.random() * 50,
      }));
      setPhase('flares');
      timers.current.push(setTimeout(() => setPhase('drop'), 700));
      timers.current.push(setTimeout(() => { setPhase('infoFlash'); setFlashIndex(0); }, 1400));
      timers.current.push(setTimeout(() => setFlashIndex(1), 1800));
      timers.current.push(setTimeout(() => setFlashIndex(2), 2200));
      timers.current.push(setTimeout(() => {
        setPhase('flip');
        setShaking(true);
        setShowBurst(true);
        setTimeout(() => setShaking(false), 500);
      }, 2700));
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

  const flashItems = issue ? [
    { label: issue.language, sub: 'Language' },
    { label: r.label, sub: 'Rarity' },
    { label: issue.repo, sub: 'Repository' },
  ] : [];

  const mergeXP = drawSource === 'choose' ? r.browseMergeXP : r.mergeXP;
  const burstColor = `${r.accent}0.7)`;

  return (
    <div className="flex flex-col items-center" ref={containerRef}>
      <div className={`relative w-80 h-[440px] mb-8 ${shaking ? 'screen-shake' : ''}`}>

        {showBurst && (
          <>
            <RadialBurst color={burstColor} />
            <SparkBurst color={burstColor} count={rarity === 'legendary' ? 24 : rarity === 'epic' ? 18 : 12} />
          </>
        )}

        {showFlares && (
          <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden rounded-xl">
            <motion.div
              className="absolute inset-0"
              style={{ background: 'rgba(0,0,0,0.7)' }}
              animate={{ opacity: phase === 'flip' ? 0 : 1 }}
              transition={{ duration: 0.5 }}
            />
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

        {phase === 'infoFlash' && (
          <>
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

        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 5 }}>
          {phase === 'idle' && (
              <div
                className="w-80 h-[440px] rounded-lg flex items-center justify-center overflow-hidden"
                style={{ background: 'rgba(9,9,11,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(${colors.accent.rgb},0.2), transparent)` }} />
                <div className="text-center">
                  <BookOpen className="w-10 h-10 mx-auto mb-3" strokeWidth={1} style={{ color: `rgba(${colors.accent.rgb},0.25)` }} />
                  <p className={`text-sm ${accent.textGhost} font-[Satoshi]`}>GitFable</p>
                </div>
              </div>
            )}

          {showCard && issue && (
            <motion.div
              className="w-80 h-[440px] rounded-lg overflow-hidden absolute"
              style={{
                background: 'rgba(9,9,11,0.92)',
                border: (phase === 'flip' || phase === 'settle')
                  ? `1px solid ${r.accent}0.35)`
                  : '1px solid rgba(255,255,255,0.08)',
                boxShadow: phase === 'settle'
                  ? `0 0 40px -8px ${r.accent}0.4), 0 0 80px -16px ${r.accent}0.2)`
                  : '0 8px 30px rgba(0, 0, 0, 0.5)',
                perspective: 800,
              }}
              initial={{ y: -500, rotateX: 15, scale: 0.9, opacity: 0 }}
              animate={
                phase === 'drop' || phase === 'infoFlash'
                  ? { y: 0, rotateX: 0, scale: 1, opacity: 1 }
                  : phase === 'flip'
                  ? { y: 0, rotateX: 0, scale: [1, 1.12, 1.04], opacity: 1 }
                  : { y: 0, rotateX: 0, scale: 1.04, opacity: 1 }
              }
              transition={
                phase === 'drop' || phase === 'infoFlash'
                  ? { duration: 0.45, ease: [0.16, 1, 0.3, 1] }
                  : phase === 'flip'
                  ? { scale: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }
                  : { duration: 0.3 }
              }
            >
              {(phase === 'flip' || phase === 'settle') && (
                <div className={`absolute top-0 left-0 right-0 h-px rarity-line-${rarity}`} />
              )}

                  {phase === 'drop' && (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="absolute inset-3 rounded-md border border-white/[0.04]" />
                      <div className="text-center">
                        <BookOpen className="w-8 h-8 mx-auto mb-2" strokeWidth={1} style={{ color: `rgba(${colors.accent.rgb},0.2)` }} />
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: `rgba(${colors.accent.rgb},0.3)` }}>GitFable</p>
                      </div>
                    </div>
                  )}
              {phase === 'infoFlash' && (
                <div className="w-full h-full" />
              )}

              {(phase === 'flip' || phase === 'settle') && (
                <>
                  {phase === 'flip' && (
                    <motion.div
                      className="absolute inset-0 pointer-events-none z-20"
                      style={{ background: `${r.accent}0.3)` }}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0 }}
                      transition={{ duration: 0.7 }}
                    />
                  )}

                  <div
                    className="absolute inset-0 pointer-events-none shimmer-sweep z-10"
                    style={{
                      background: `linear-gradient(105deg, transparent 40%, ${f.color}${f.intensity * 0.2}) 50%, transparent 60%)`,
                      backgroundSize: '250% 100%',
                    }}
                  />

                  {phase === 'settle' && (
                    <motion.div
                      className="absolute inset-0 pointer-events-none z-10"
                      animate={{
                        background: [
                          `radial-gradient(circle at 20% 20%, ${r.accent}0.06), transparent 50%)`,
                          `radial-gradient(circle at 80% 80%, ${r.accent}0.06), transparent 50%)`,
                          `radial-gradient(circle at 20% 80%, ${r.accent}0.06), transparent 50%)`,
                          `radial-gradient(circle at 80% 20%, ${r.accent}0.06), transparent 50%)`,
                        ],
                      }}
                      transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                    />
                  )}

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
                        <span className={`text-xs px-2 py-0.5 rounded border font-mono ${accent.bgSubtle} ${accent.text} ${accent.borderFaint}`}>{issue.language}</span>
                        <Badge variant="outline" className={`text-xs ${DIFF_COLORS[issue.difficulty] || ''}`}>{issue.difficulty}</Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-zinc-500 font-mono">
                        <Star className={`w-3.5 h-3.5 ${accent.textSoft}`} strokeWidth={1.5} />{issue.stars?.toLocaleString()}
                      </div>
                    </motion.div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        {state === 'idle' && (
          <>
            <div className="relative">
              <div className="absolute -inset-3 rounded-xl border energy-ring pointer-events-none" style={{ borderColor: `rgba(${colors.accent.rgb},0.2)` }} />
              <div className="absolute -inset-6 pointer-events-none">
                <div
                  className="w-full h-full energy-ring-rotate"
                  style={{
                    background: `conic-gradient(from 0deg, transparent, rgba(${colors.accent.rgb},0.15), transparent, rgba(${colors.accent.rgb},0.1), transparent)`,
                    borderRadius: '12px',
                    mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    maskComposite: 'xor',
                    WebkitMaskComposite: 'xor',
                    padding: '2px',
                  }}
                />
              </div>
              <button
                data-testid="draw-button"
                onClick={onDraw}
                className="rune-btn px-8 py-3 rounded-lg animate-pulse-glow relative z-10"
              >
                <Shuffle className="w-4 h-4 inline mr-2" />Draw
              </button>
            </div>
            {redrawsRemaining != null && (
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-600 mt-2">
                {redrawsRemaining} draw{redrawsRemaining !== 1 ? 's' : ''} remaining
              </p>
            )}
          </>
        )}
        {state === 'shuffling' && (
          <div className="flex flex-col items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 rounded-full border-2"
              style={{ borderColor: `rgba(${colors.accent.rgb},0.3)`, borderTopColor: `rgba(${colors.accent.rgb},1)` }}
            />
            <p className={`font-mono text-xs ${accent.text} uppercase tracking-widest animate-pulse`}>Drawing...</p>
          </div>
        )}
        {state === 'revealed' && (
          <div className="flex flex-col items-center gap-3">
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-4 px-5 py-3 rounded-xl border"
              style={{
                background: `${r.accent}0.06)`,
                borderColor: `${r.accent}0.25)`,
                boxShadow: `0 0 20px -6px ${r.accent}0.3)`,
              }}
            >
              {Icon && (
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Icon className="w-5 h-5" style={{ color: `${r.accent}0.8)` }} />
                </motion.div>
              )}
              <div className="flex flex-col">
                <motion.span
                  className="text-sm font-semibold font-mono"
                  style={{ color: `${r.accent}0.9)` }}
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.3, 1] }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  +{xpAwarded != null ? xpAwarded : r.drawXP} XP
                </motion.span>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Draw reward</span>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="flex flex-col">
                <motion.span
                  className="text-sm font-semibold font-mono"
                  style={{ color: `${r.accent}0.9)` }}
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.3, 1] }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                >
                  +{mergeXP} XP
                </motion.span>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">On merge</span>
              </div>
            </motion.div>

            <motion.div
              className="flex items-center gap-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <motion.button
                    data-testid="bookmark-button"
                    onClick={onBookmark}
                    whileHover={{ scale: 1.08, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    className={`flex items-center gap-1.5 text-xs text-zinc-400 ${accent.bookmarkHover} font-mono uppercase tracking-wider transition-colors px-3 py-2 rounded-lg border border-transparent`}
                  >
                <Bookmark className="w-3.5 h-3.5" />Bookmark
              </motion.button>
              <motion.button
                data-testid="redraw-button"
                onClick={onRedraw}
                whileHover={{ scale: 1.08, y: -2 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 font-mono uppercase tracking-wider transition-colors px-3 py-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10"
              >
                <RotateCcw className="w-3 h-3" />Redraw
              </motion.button>
              <motion.a
                data-testid="view-github-button"
                href={issue?.url}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.08, y: -2 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 font-mono uppercase tracking-wider transition-colors px-3 py-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10"
              >
                <ExternalLink className="w-3 h-3" />GitHub
              </motion.a>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
