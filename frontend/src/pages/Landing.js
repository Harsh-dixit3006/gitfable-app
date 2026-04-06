import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { motion, useScroll, useTransform, useInView, AnimatePresence } from 'framer-motion';
import { ArrowRight, BookOpen, Compass, GitPullRequest, Award, Star, Users, FolderGit2, Zap, Github, ScrollText, GitCommitHorizontal, Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import { colors, accent } from '@/lib/theme';

const EASE = [0.22, 1, 0.36, 1];

/* ═══ Embers ═══ */
function Embers({ count = 25 }) {
  const embers = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 10}s`,
      duration: `${8 + Math.random() * 12}s`,
      size: 2 + Math.random() * 3,
      brightness: 0.3 + Math.random() * 0.6,
      alt: i % 3 === 0,
    })), [count]
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {embers.map((e, i) => (
        <div
          key={i}
          className="absolute bottom-[-10px] rounded-full"
          style={{
            left: e.left,
            width: `${e.size}px`,
            height: `${e.size}px`,
            background: `rgba(${colors.accent.rgb},${e.brightness})`,
            boxShadow: `0 0 ${e.size * 4}px ${e.size}px rgba(${colors.accent.rgb},${e.brightness * 0.4})`,
            animation: `${e.alt ? 'ember-rise-alt' : 'ember-rise'} ${e.duration} ${e.delay} ease-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ═══ 3D Card ═══ */
function HeroCard({ card }) {
  const cardRef = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, active: false });
  const handleMouseMove = useCallback((e) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: y * -15, y: x * 15, active: true });
  }, []);
  const handleLeave = useCallback(() => setTilt({ x: 0, y: 0, active: false }), []);

  return (
    <div ref={cardRef} onMouseMove={handleMouseMove} onMouseLeave={handleLeave} className="relative cursor-default" style={{ perspective: '1200px' }}>
      <motion.div
        animate={{ rotateX: tilt.x, rotateY: tilt.y, scale: tilt.active ? 1.03 : 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        style={{ transformStyle: 'preserve-3d' }}
        className="relative"
      >
        <div className="relative rounded-2xl overflow-hidden" style={{
          background: 'linear-gradient(160deg, rgba(15,15,18,0.98), rgba(9,9,11,0.99))',
          border: `1px solid rgba(${colors.accent.rgb},0.2)`,
          boxShadow: `0 25px 60px -12px rgba(0,0,0,0.7), 0 0 60px -20px rgba(${colors.accent.rgb},0.1)`,
        }}>
          <div className="absolute inset-0 card-shimmer pointer-events-none" />
          <div className="absolute top-0 left-8 right-8 h-px pointer-events-none" style={{ background: `linear-gradient(90deg, transparent, rgba(${colors.accent.rgb},0.3), transparent)` }} />
          <div className="relative p-8">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2 text-xs text-zinc-600 font-mono">
                <Github className="w-3.5 h-3.5" strokeWidth={1.5} />{card.repo}
              </div>
              <span className={`text-[9px] font-mono uppercase tracking-[0.2em] px-2.5 py-1 rounded-full ${accent.textBright} ${accent.badgeMuted}`}>legendary</span>
            </div>
            <h3 className="text-lg font-medium text-zinc-100 leading-snug mb-5 tracking-tight">{card.title}</h3>
            <div className="flex items-center gap-2 mb-5 py-2.5 px-3.5 rounded-lg" style={{ background: `rgba(${colors.accent.rgb},0.04)`, border: `1px solid rgba(${colors.accent.rgb},0.08)` }}>
              <Zap className={`w-3.5 h-3.5 ${accent.textMuted}`} strokeWidth={2} />
                  <span className={`text-xs font-mono ${accent.textSoft}`}>+85 XP on merge</span>
            </div>
            <div className="flex items-center justify-between">
                <span className={`text-[11px] px-2.5 py-1.5 rounded-md font-mono ${accent.textBright} ${accent.badgeMuted}`}>{card.lang}</span>
              <span className="text-xs text-zinc-500 flex items-center gap-1.5 font-mono"><Star className="w-3.5 h-3.5" strokeWidth={1.5} />{card.stars}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ═══ Code Block ═══ */
function CodeBlock() {
  return (
    <div className="rounded-xl overflow-hidden text-left" style={{ background: 'rgba(9,9,11,0.7)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.04]">
        <div className="w-2.5 h-2.5 rounded-full bg-white/[0.06]" />
        <div className="w-2.5 h-2.5 rounded-full bg-white/[0.06]" />
        <div className="w-2.5 h-2.5 rounded-full bg-white/[0.06]" />
        <span className="ml-2 text-[10px] font-mono text-zinc-700">your-journey.ts</span>
      </div>
      <div className="p-5 font-mono text-[13px] leading-[1.9] whitespace-nowrap">
        <span className="text-purple-400">import</span>
        <span className="text-zinc-500">{' { '}</span>
        <span className="text-zinc-300">draw</span>
        <span className="text-zinc-500">,</span>
        <span className="text-zinc-300"> submit</span>
        <span className="text-zinc-500">,</span>
        <span className="text-zinc-300"> merge</span>
        <span className="text-zinc-500">{' } '}</span>
        <span className="text-purple-400">from</span>{' '}
        <span className={accent.textBright}>"gitfable"</span>
        <span className="text-zinc-500">;</span>
        <br /><br />
        <span className="text-purple-400">const</span>{' '}
        <span className="text-zinc-300">issue</span>
        <span className="text-zinc-500"> = </span>
        <span className="text-blue-400">draw</span>
        <span className="text-zinc-500">{'({ '}</span>
        <span className="text-zinc-400">lang</span>
        <span className="text-zinc-500">: </span>
        <span className={accent.textBright}>"typescript"</span>
        <span className="text-zinc-500">{', '}</span>
        <span className="text-zinc-400">difficulty</span>
        <span className="text-zinc-500">: </span>
        <span className={accent.textBright}>"beginner"</span>
        <span className="text-zinc-500">{' });'}</span>
        <br />
        <span className="text-purple-400">const</span>{' '}
        <span className="text-zinc-300">pr</span>
        <span className="text-zinc-500">{'    = '}</span>
        <span className="text-blue-400">submit</span>
        <span className="text-zinc-500">(</span>
        <span className="text-zinc-300">issue</span>
        <span className="text-zinc-500">);</span>
        <br />
        <span className="text-purple-400">const</span>{' '}
        <span className="text-zinc-300">xp</span>
        <span className="text-zinc-500">{'    = '}</span>
        <span className="text-blue-400">merge</span>
        <span className="text-zinc-500">(</span>
        <span className="text-zinc-300">pr</span>
        <span className="text-zinc-500">);</span>
        {'  '}
        <span className="text-zinc-700">{'// +85 XP earned'}</span>
      </div>
    </div>
  );
}

/* ═══ Animated Number ═══ */
function AnimatedNumber({ target, duration = 2000 }) {
  const [current, setCurrent] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  useEffect(() => {
    if (!isInView || target <= 0) return;
    const steps = 50;
    const increment = target / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      setCurrent(Math.min(Math.round(increment * step), target));
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
    return () => clearInterval(timer);
  }, [target, duration, isInView]);
  return <span ref={ref}>{current.toLocaleString()}</span>;
}

/* ═══ Marquee ═══ */
function Marquee({ items, speed = 35 }) {
  return (
    <div className="overflow-hidden whitespace-nowrap select-none">
      <motion.div
        className="inline-flex gap-14"
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: speed, ease: 'linear', repeat: Infinity }}
      >
        {[...items, ...items].map((item, i) => (
            <span key={i} className="inline-flex items-center gap-3 text-zinc-600 font-mono text-[11px] tracking-wider uppercase">
              <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: `rgba(${colors.accent.rgb},0.25)` }} />{item}
            </span>
        ))}
      </motion.div>
    </div>
  );
}

/* ═══ Scroll-driven text reveal — words light up as you scroll ═══ */
function TextRevealSection({ paragraphs }) {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 0.8', 'end 0.35'],
  });

  /* Count total words across all paragraphs to assign global indices */
  const totalWords = paragraphs.reduce((sum, p) => sum + p.text.split(' ').length, 0);
  let wordIndex = 0;

  return (
    <div ref={containerRef}>
      {paragraphs.map((para, pi) => {
        const words = para.text.split(' ');
        const elements = words.map((word) => {
          const globalStart = wordIndex / totalWords;
          const globalEnd = (wordIndex + 1) / totalWords;
          wordIndex++;
          return (
            <TextRevealWord
              key={`${pi}-${wordIndex}`}
              word={word}
              progress={scrollYProgress}
              range={[globalStart, globalEnd]}
              colorFrom={para.colorFrom}
              colorTo={para.colorTo}
            />
          );
        });
        return (
          <div key={pi}>
            {para.divider && <div className="h-px w-16 my-10" style={{ background: `linear-gradient(to right, rgba(${colors.accent.rgb},0.4), transparent)` }} />}
            <p className={para.className} style={{ ...para.style, display: 'flex', flexWrap: 'wrap', gap: '0 0.3em' }}>
              {elements}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function TextRevealWord({ word, progress, range, colorFrom, colorTo }) {
  const opacity = useTransform(progress, range, [0.15, 1]);
  const color = useTransform(progress, range, [colorFrom, colorTo]);
  return (
    <motion.span style={{ opacity, color }} className="inline-block">
      {word}
    </motion.span>
  );
}

/* ═══ Journey milestone ═══ */
function Milestone({ stage, index, isLast }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ delay: 0.1, duration: 0.8, ease: EASE }}
      className="relative grid grid-cols-[60px_1fr] md:grid-cols-[80px_1fr] gap-6 md:gap-10"
    >
      <div className="flex flex-col items-center">
        <div
          className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center flex-shrink-0 relative z-10"
          style={{
            background: `rgba(${colors.accent.rgb},${0.04 + index * 0.03})`,
            border: `1px solid rgba(${colors.accent.rgb},${0.1 + index * 0.08})`,
            boxShadow: `0 0 ${20 + index * 10}px -6px rgba(${colors.accent.rgb},${0.1 + index * 0.08})`,
          }}
        >
          <stage.icon className="w-4 h-4 md:w-5 md:h-5" strokeWidth={1.5} style={{ color: `rgba(${colors.accent.rgb},0.7)` }} />
        </div>
        {!isLast && (
          <div className="w-px flex-1 mt-4 min-h-[40px]" style={{ background: `linear-gradient(to bottom, rgba(${colors.accent.rgb},0.15), rgba(${colors.accent.rgb},0.03))` }} />
        )}
      </div>
      <div className="pb-16 md:pb-20">
        <span className={`font-mono text-[10px] ${accent.textMuted} uppercase tracking-[0.25em] block mb-3`}>{stage.label}</span>
        <h3 className="font-display text-xl sm:text-2xl md:text-3xl font-semibold leading-[1.1] mb-4 text-zinc-200" style={{ letterSpacing: '-0.05em' }}>
          {stage.title}
        </h3>
        <p className="text-[15px] text-zinc-500 leading-relaxed max-w-lg">{stage.desc}</p>
        {stage.detail && (
          <p className="text-xs font-mono text-zinc-600 mt-4 tracking-wide">{stage.detail}</p>
        )}
      </div>
    </motion.div>
  );
}

/* ═══ DATA ═══ */

const marqueeRepos = [
  'vercel/next.js', 'facebook/react', 'rust-lang/rust', 'django/django', 'golang/go',
  'sveltejs/svelte', 'vuejs/vue', 'denoland/deno', 'tailwindlabs/tailwindcss',
  'prisma/prisma', 'supabase/supabase', 'withastro/astro',
];

const journeyStages = [
  {
    icon: Compass,
    label: 'The Discovery',
    title: 'Find the issue that was meant for you.',
    desc: 'No more doom-scrolling through thousands of issues. GitFable curates issues that match your language, skill level, and curiosity — then presents them one at a time.',
    detail: 'Python, TypeScript, Rust, Go, and more',
  },
  {
    icon: GitCommitHorizontal,
    label: 'The First Commit',
    title: 'Push code to a project you admire.',
    desc: "You've read their docs. You've used their library. Now you're contributing to it. Fork the repo, write the code, open the PR. GitFable tracks your progress.",
  },
  {
    icon: GitPullRequest,
    label: 'The First Merge',
    title: 'See your name in the commit log. Forever.',
    desc: "That green 'Merged' badge isn't just a status — it's proof. Your code is now part of something bigger. GitFable verifies the merge and marks your chapter complete.",
    detail: 'Verified via GitHub webhooks',
  },
  {
    icon: Trophy,
    label: 'The Legend Grows',
    title: 'XP. Badges. Streaks. Recognition.',
    desc: "Every contribution earns XP. Hit milestones to unlock narrative badges. Build streaks. Climb the leaderboard. Your profile becomes a living record of your open-source story.",
    detail: 'Common, Rare, Epic, and Legendary tiers',
  },
];

/* ═══ LANDING PAGE ═══ */

export default function Landing() {
  const { user, setShowLogin } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ merged_draws: 0, active_users: 0, distinct_repos: 0 });
  const [activity, setActivity] = useState([]);

  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.6], [1, 0.96]);

  const spotlightRef = useRef(null);
  const handleSpotlight = useCallback((e) => {
    const el = spotlightRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }, []);

  useEffect(() => {
    api.get('/stats')
      .then(r => setStats(r._data))
      .catch((err) => {
        console.error('Failed to load stats:', err);
        // Silent fail - stats are decorative on landing page
      });
    api.get('/activity')
      .then(r => setActivity(r._data || []))
      .catch((err) => {
        console.error('Failed to load activity:', err);
        // Silent fail - activity feed is decorative on landing page
      });
  }, []);

  const handleCTA = useCallback(() => {
    if (user) navigate('/discover');
    else setShowLogin(true);
  }, [user, navigate, setShowLogin]);

  return (
    <div className="pt-16 relative" data-testid="landing-page">

      {/* ═══ HERO ═══ */}
      <section
        ref={(el) => { heroRef.current = el; spotlightRef.current = el; }}
        onMouseMove={handleSpotlight}
        className="spotlight-container relative min-h-[100vh] flex flex-col items-center justify-center overflow-hidden"
      >
        <Embers count={35} />
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-background to-transparent z-20 pointer-events-none" />

        <motion.div style={{ opacity: heroOpacity, scale: heroScale }} className="relative z-10 w-full max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-16">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left — headline + subtitle + CTA */}
            <div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 1.2, ease: EASE }}
                className="flex items-center gap-3 mb-10"
              >
                <div className="h-px w-12 bg-gradient-to-r from-transparent" style={{ backgroundImage: `linear-gradient(to right, transparent, rgba(${colors.accent.rgb},0.4))` }} />
                <span className="font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: `rgba(${colors.accent.rgb},0.5)` }}>GitFable</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 1.2, ease: EASE }}
                className="font-display font-semibold leading-[0.95] mb-8"
                style={{ fontSize: 'clamp(2.2rem, 5vw, 4.5rem)', letterSpacing: '-0.07em' }}
              >
                <span className="text-zinc-200">EVERY CODER</span><br />
                <span className="text-zinc-200">SHOULD HAVE AN </span><br />
                <span style={{
                  background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #b45309 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>ORIGIN STORY.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.9, ease: EASE }}
                className="text-zinc-500 text-base sm:text-lg max-w-lg leading-relaxed mb-10"
              >
                GitFable turns your first open-source contribution into an adventure.
                Find issues. Submit PRs. Build your developer legend.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1, duration: 0.8, ease: EASE }}
                className="flex flex-wrap items-center gap-5"
              >
                <button
                  onClick={handleCTA}
                  className="group relative flex items-center gap-3 px-9 py-4 rounded-full text-[12px] font-bold uppercase tracking-[0.2em] overflow-hidden font-mono"
                  style={{
                    background: `linear-gradient(135deg, rgba(${colors.accent.rgb},0.14), rgba(${colors.accent.rgb},0.06))`,
                    border: `1px solid rgba(${colors.accent.rgb},0.35)`,
                    color: '#fef3c7',
                    boxShadow: `0 0 50px -15px rgba(${colors.accent.rgb},0.35), inset 0 1px 0 rgba(${colors.accent.rgb},0.1)`,
                  }}
                  data-testid="hero-cta-button"
                >
                  <span className="relative z-10">Start Your Journey</span>
                  <ArrowRight className="w-4 h-4 relative z-10 transition-transform group-hover:translate-x-1.5 duration-300" />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `rgba(${colors.accent.rgb},0.1)` }} />
                </button>
                <button
                  onClick={() => navigate('/leaderboard')}
                  className="text-zinc-500 hover:text-zinc-300 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-300"
                  data-testid="hero-leaderboard-button"
                >
                  View Leaderboard &rarr;
                </button>
              </motion.div>
            </div>

            {/* Right — code block */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, duration: 0.9, ease: EASE }}
              className="hidden lg:block"
            >
              <CodeBlock />
            </motion.div>
          </div>

          {/* Mobile code block — below on small screens */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.9, ease: EASE }}
            className="lg:hidden mt-12 max-w-lg mx-auto"
          >
            <CodeBlock />
          </motion.div>
        </motion.div>
      </section>

      {/* ═══ Marquee ═══ */}
      <div className="py-6 border-y border-white/[0.025]">
        <Marquee items={marqueeRepos} />
      </div>

      {/* ═══ THE UNCOMFORTABLE TRUTH — scroll-driven word reveal ═══ */}
      <section className="relative py-32 sm:py-40 px-6 sm:px-8 lg:px-16">
        <div className="max-w-4xl mx-auto">
          <TextRevealSection paragraphs={[
            {
              text: "You've starred hundreds of repos. Bookmarked dozens of 'good first issues.' Read contributing guides you never came back to.",
              className: 'font-display font-semibold leading-[1.35]',
              style: { fontSize: 'clamp(1.3rem, 2.8vw, 2.2rem)', letterSpacing: '-0.06em' },
              colorFrom: 'rgba(255,255,255,0.1)',
              colorTo: '#a1a1aa',
            },
            {
              text: "What if your first contribution felt less like a chore — and more like the start of something?",
              className: 'font-display font-semibold leading-[1.3]',
              style: { fontSize: 'clamp(1.5rem, 3.2vw, 2.8rem)', letterSpacing: '-0.06em' },
              colorFrom: `rgba(${colors.accent.rgb},0.1)`,
              colorTo: '#fbbf24',
              divider: true,
            },
          ]} />
        </div>
      </section>

      {/* ═══ THE BRIDGE ═══ */}
      <section className="relative py-32 px-6 sm:px-8 lg:px-16">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(${colors.accent.rgb},0.08), transparent)` }} />

        <div className="max-w-[1400px] mx-auto grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: EASE }}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] block mb-6" style={{ color: `rgba(${colors.accent.rgb},0.6)` }}>How It Works</span>
            <h2 className="font-display font-semibold leading-[0.98] mb-6" style={{ fontSize: 'clamp(1.7rem, 3.2vw, 2.8rem)', letterSpacing: '-0.06em' }}>
              GitFable matches you with{' '}
              <span style={{ color: '#fbbf24' }}>real issues</span>{' '}
              from projects that matter.
            </h2>
            <p className="text-[15px] text-zinc-500 leading-relaxed mb-8 max-w-lg">
              Set your languages and skill level. We surface curated "good first issues"
              from top open-source repositories — each one rated by difficulty and
              impact. No more analysis paralysis. Just your next contribution, ready to go.
            </p>
            <div className="flex items-center gap-6 text-sm">
              {[
                { icon: Zap, val: '28+', label: 'Curated Issues' },
                { icon: FolderGit2, val: '10+', label: 'Languages' },
                { icon: Users, val: `${stats.active_users || '\u2014'}`, label: 'Contributors' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2">
                  <s.icon className="w-3 h-3" strokeWidth={1.5} style={{ color: `rgba(${colors.accent.rgb},0.5)` }} />
                  <span className="font-mono text-[12px] text-zinc-400">{s.val}</span>
                  <span className="text-[10px] text-zinc-500">{s.label}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 1, ease: EASE }}
            className="flex justify-center"
          >
            <div className="w-full max-w-sm">
              <HeroCard card={{ repo: 'vercel/next.js', title: 'Fix hydration mismatch in App Router streaming', lang: 'TypeScript', stars: '120k' }} />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ THE JOURNEY ═══ */}
      <section className="relative py-32 px-6 sm:px-8 lg:px-16" data-testid="how-it-works">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 20% 50%, rgba(${colors.accent.rgb},0.03), transparent 50%)` }} />

        <div className="max-w-[1400px] mx-auto">
          <div className="grid lg:grid-cols-12 gap-16 lg:gap-20">
            <div className="lg:col-span-4">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, ease: EASE }}
                className="lg:sticky lg:top-32"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] block mb-6" style={{ color: `rgba(${colors.accent.rgb},0.6)` }}>Your Path</span>
                <h2 className="font-display font-semibold leading-[0.98] mb-6" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 3rem)', letterSpacing: '-0.06em' }}>
                  From first commit to{' '}
                  <span style={{ color: '#fbbf24' }}>legend.</span>
                </h2>
                <p className="text-zinc-500 text-sm leading-relaxed max-w-xs">
                  Every open-source contributor started exactly where you are.
                  Here's the path forward.
                </p>
              </motion.div>
            </div>

            <div className="lg:col-span-8">
              {journeyStages.map((stage, i) => (
                <Milestone key={i} stage={stage} index={i} isLast={i === journeyStages.length - 1} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ STATS ═══ */}
      {(stats.merged_draws > 0 || stats.active_users > 1) && <section className="relative py-36 px-6 sm:px-8 lg:px-16" data-testid="stats-section">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(${colors.accent.rgb},0.08), transparent)` }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 50%, rgba(${colors.accent.rgb},0.03), transparent 50%)` }} />

        <div className="relative max-w-[1400px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: EASE }}
            className="text-center mb-20"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] block mb-5" style={{ color: `rgba(${colors.accent.rgb},0.6)` }}>Community</span>
            <h2 className="font-display font-semibold" style={{ fontSize: 'clamp(1.7rem, 3.2vw, 2.8rem)', letterSpacing: '-0.06em' }}>
              A growing community of{' '}
              <span style={{ color: '#fbbf24' }}>contributors.</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3">
            {[
              { label: 'Contributions Merged', value: stats.merged_draws, icon: GitPullRequest },
              { label: 'Active Contributors', value: stats.active_users, icon: Users },
              { label: 'Repositories', value: stats.distinct_repos, icon: FolderGit2 },
            ].map(({ label, value, icon: Icon }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.8, ease: EASE }}
                className="text-center py-10 md:py-0"
                style={i > 0 ? { borderLeft: '1px solid rgba(255,255,255,0.03)' } : undefined}
              >
                <Icon className="w-5 h-5 text-zinc-600 mx-auto mb-8" strokeWidth={1.5} />
                <p className="font-display font-semibold text-zinc-100" style={{ fontSize: 'clamp(2.8rem, 5.5vw, 4.5rem)', letterSpacing: '-0.07em' }}>
                  <AnimatedNumber target={value} />
                </p>
                <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.25em] mt-4">{label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>}

      {/* ═══ BENTO ═══ */}
      <section className="relative px-6 sm:px-8 lg:px-16 py-20" data-testid="signal-bento-section">
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: EASE }}
            className="md:col-span-5 rounded-2xl p-8"
            style={{ background: 'rgba(9,9,11,0.5)', border: '1px solid rgba(255,255,255,0.03)' }}
            data-testid="signal-bento-primary"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] mb-5" style={{ color: `rgba(${colors.accent.rgb},0.6)` }}>Your Dashboard</p>
            <h3 className="font-display text-xl md:text-2xl font-semibold leading-tight mb-4" style={{ letterSpacing: '-0.05em' }}>Track every step of your journey.</h3>
            <p className="text-[13px] text-zinc-500 mb-8">Contributions, streaks, XP progress — all in one place.</p>
            <div className="grid grid-cols-3 gap-3">
              {[{ label: 'This Week', value: '3' }, { label: 'Avg Merge', value: '27h' }, { label: 'XP Earned', value: '+130' }].map((item) => (
                <div key={item.label} className="rounded-lg px-3 py-3" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.025)' }} data-testid={`signal-metric-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
                  <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest mb-1">{item.label}</p>
                  <p className="text-lg font-semibold text-zinc-300">{item.value}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.08, duration: 0.8, ease: EASE }}
            className="md:col-span-3 rounded-2xl p-7"
            style={{ background: 'rgba(9,9,11,0.5)', border: '1px solid rgba(255,255,255,0.03)' }}
            data-testid="signal-bento-secondary-a"
          >
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-4">Top Language</p>
            <p className="text-2xl font-semibold text-zinc-200 mb-1">TypeScript</p>
            <p className="text-[13px] text-zinc-600">Most active issue pool this week</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.16, duration: 0.8, ease: EASE }}
            className="md:col-span-4 rounded-2xl p-7"
            style={{ background: 'rgba(9,9,11,0.5)', border: '1px solid rgba(255,255,255,0.03)' }}
            data-testid="signal-bento-secondary-b"
          >
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-4">Trending</p>
            <div className="space-y-2">
              {['Hydration mismatch fixes trending', 'Documentation issues up 18%', 'Rust beginner issues refreshed'].map((line) => (
                <div key={line} className="rounded-lg px-3 py-2.5 text-[12px] text-zinc-500" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)' }}>{line}</div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ ACTIVITY ═══ */}
      {activity.length > 0 && (
        <section className="relative py-32 px-6 sm:px-8 lg:px-16" data-testid="activity-feed">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />
          <div className="max-w-[1400px] mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: EASE }}
              className="mb-16"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] block mb-6" style={{ color: `rgba(${colors.accent.rgb},0.6)` }}>Live</span>
              <h2 className="font-display font-semibold" style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.4rem)', letterSpacing: '-0.06em' }}>
                Developers writing their stories{' '}
                <span style={{ color: '#fbbf24' }}>right now.</span>
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activity.slice(0, 6).map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06, duration: 0.7, ease: EASE }}
                  className="group rounded-xl p-6 cursor-default"
                  style={{ background: 'rgba(9,9,11,0.4)', border: '1px solid rgba(255,255,255,0.025)' }}
                  whileHover={{ y: -4, borderColor: `rgba(${colors.accent.rgb},0.1)` }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <img src={a.avatar_url} alt="" className="w-7 h-7 rounded-full border border-white/[0.05] bg-zinc-900" />
                    <span className="text-sm font-medium text-zinc-300">{a.username}</span>
                    <span className="text-[10px] text-zinc-600 font-mono ml-auto">{getTimeAgo(a.created_at)}</span>
                  </div>
                  <p className="text-[13px] text-zinc-500">
                    contributed to <span className="font-medium" style={{ color: `rgba(${colors.accent.rgb},0.5)` }}>{a.repo_owner}/{a.repo_name}</span>
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ FINAL CTA ═══ */}
      <section className="relative py-44 px-6 sm:px-8 lg:px-16 overflow-hidden" data-testid="bottom-cta">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(${colors.accent.rgb},0.06), transparent)` }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(600px circle at 50% 60%, rgba(${colors.accent.rgb},0.05), transparent)` }} />
        <Embers count={15} />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1.2, ease: EASE }}
          className="relative z-10 text-center max-w-5xl mx-auto"
        >
          <div className="w-8 h-px mx-auto mb-12" style={{ background: `rgba(${colors.accent.rgb},0.3)` }} />

          <h2 className="font-display font-semibold leading-[0.95] mb-8" style={{ fontSize: 'clamp(2.2rem, 5.5vw, 5rem)', letterSpacing: '-0.07em' }}>
            Your origin story<br />
            <span style={{
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b, #b45309)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>starts here.</span>
          </h2>

          <p className="text-zinc-500 text-base sm:text-lg mb-14 max-w-md mx-auto leading-relaxed">
            One issue. One pull request. One contribution at a time.
          </p>

          <button
            onClick={handleCTA}
            className="group relative inline-flex items-center gap-3 px-10 py-5 rounded-full text-[12px] font-bold uppercase tracking-[0.2em] overflow-hidden font-mono"
            style={{
              background: `linear-gradient(135deg, rgba(${colors.accent.rgb},0.14), rgba(${colors.accent.rgb},0.06))`,
              border: `1px solid rgba(${colors.accent.rgb},0.35)`,
              color: '#fef3c7',
              boxShadow: `0 0 60px -15px rgba(${colors.accent.rgb},0.4), 0 0 120px -30px rgba(${colors.accent.rgb},0.15), inset 0 1px 0 rgba(${colors.accent.rgb},0.15)`,
            }}
            data-testid="bottom-cta-button"
          >
            <span className="relative z-10">Start Your Journey</span>
            <ArrowRight className="w-4 h-4 relative z-10 transition-transform group-hover:translate-x-2 duration-300" />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `rgba(${colors.accent.rgb},0.1)` }} />
          </button>
        </motion.div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="relative py-12 px-6 sm:px-8 lg:px-16">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.02] to-transparent" />
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-4 h-4" strokeWidth={1.5} style={{ color: `rgba(${colors.accent.rgb},0.4)` }} />
            <span className="font-display text-lg text-zinc-500 tracking-tight">GitFable</span>
          </div>
          <p className="font-mono text-[10px] text-zinc-600 tracking-wider">Every PR is a page in your legend.</p>
        </div>
      </footer>
    </div>
  );
}

function getTimeAgo(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - new Date(timestamp).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'now';
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
