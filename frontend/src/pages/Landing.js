import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Compass, GitPullRequest, Award, Star, Users, FolderGit2, ChevronRight, Zap, Sparkles } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function AnimatedNumber({ target, duration = 2000 }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (target <= 0) return;
    const steps = 50;
    const increment = target / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      setCurrent(Math.min(Math.round(increment * step), target));
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
    return () => clearInterval(timer);
  }, [target, duration]);
  return <span>{current.toLocaleString()}</span>;
}

const steps = [
  { icon: Compass, title: 'Set Your Filters', desc: 'Choose languages and difficulty levels that match your expertise and curiosity.', accent: 'amber' },
  { icon: BookOpen, title: 'Draw an Issue', desc: 'The archive shuffles and presents a curated issue from top open-source projects.', accent: 'violet' },
  { icon: GitPullRequest, title: 'Submit Your PR', desc: 'Work on it externally, submit your pull request on GitHub.', accent: 'emerald' },
  { icon: Award, title: 'Earn Your Legend', desc: 'Gain XP, unlock narrative badges, and climb the leaderboard.', accent: 'amber' },
];

const ACCENT_MAP = {
  amber: { border: 'border-amber-500/30', glow: 'rgba(245,158,11,0.15)', text: 'text-amber-500', bg: 'bg-amber-500/10' },
  violet: { border: 'border-violet-500/30', glow: 'rgba(139,92,246,0.15)', text: 'text-violet-400', bg: 'bg-violet-500/10' },
  emerald: { border: 'border-emerald-500/30', glow: 'rgba(16,185,129,0.15)', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
};

const EASE = [0.22, 1, 0.36, 1];
const HERO_STAGGER = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.9, ease: EASE, staggerChildren: 0.12 } },
};
const HERO_ITEM = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
};

export default function Landing() {
  const { user, setShowLogin } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ issues_resolved: 0, active_authors: 0, repositories_reached: 0 });
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    axios.get(`${API}/stats`).then(r => setStats(r.data)).catch(() => {});
    axios.get(`${API}/activity`).then(r => setActivity(r.data)).catch(() => {});
  }, []);

  const handleCTA = useCallback(() => {
    if (user) navigate('/discover');
    else setShowLogin(true);
  }, [user, navigate, setShowLogin]);

  return (
    <div className="pt-16 relative" data-testid="landing-page">
      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden">
        {/* Layered ambient glows */}
        <div className="absolute inset-0 ambient-amber" />
        <div className="absolute inset-0 ambient-violet" />
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] rounded-full opacity-20" style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.15), transparent 70%)', filter: 'blur(80px)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full opacity-15" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.2), transparent 70%)', filter: 'blur(60px)' }} />

        <div className="relative max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-20 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: Copy */}
            <motion.div variants={HERO_STAGGER} initial="initial" animate="animate">
              <motion.div variants={HERO_ITEM} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/5 mb-8">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" strokeWidth={1.5} />
                <span className="font-mono text-xs text-amber-500 uppercase tracking-widest">Open Source Archive</span>
              </motion.div>

              <motion.h1 variants={HERO_ITEM} className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.04] tracking-tight mb-6">
                Write Your<br />
                <span className="gold-text">Open Source</span><br />
                Story
              </motion.h1>

              <motion.p variants={HERO_ITEM} className="text-base md:text-lg text-zinc-300 max-w-lg mb-10 leading-relaxed">
                GitFable matches you with curated issues from top repositories.
                Draw your next contribution, earn XP, collect narrative badges,
                and forge your developer legend.
              </motion.p>

              <motion.div variants={HERO_ITEM} className="flex flex-wrap gap-4">
                <button onClick={handleCTA} className="rune-btn px-8 py-3.5 rounded-lg text-sm tracking-widest animate-pulse-glow" data-testid="hero-cta-button">
                  Begin Your Story <ArrowRight className="w-4 h-4 inline ml-2" />
                </button>
                <button onClick={() => navigate('/leaderboard')} className="px-6 py-3.5 text-zinc-400 hover:text-white font-mono text-xs uppercase tracking-widest hover:bg-white/5 rounded-lg border border-white/5 hover:border-white/10" style={{ transition: 'color 0.2s, background-color 0.2s, border-color 0.2s' }} data-testid="hero-leaderboard-button">
                  View Leaderboard
                </button>
              </motion.div>

              {/* Quick stats under CTA */}
              <motion.div variants={HERO_ITEM} className="flex gap-6 mt-10 pt-8 border-t border-white/5">
                {[
                  { label: 'Issues', value: '28+', icon: Zap },
                  { label: 'Languages', value: '10+', icon: FolderGit2 },
                  { label: 'Authors', value: `${stats.active_authors}`, icon: Users },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <s.icon className="w-3.5 h-3.5 text-amber-500/60" strokeWidth={1.5} />
                    <span className="font-mono text-sm text-amber-500 font-bold">{s.value}</span>
                    <span className="text-xs text-zinc-500">{s.label}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* Right: Floating card stack */}
            <div className="hidden lg:block relative h-[500px]">
              {/* Ambient glow behind cards */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full animate-soft-glow" style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.1), transparent 70%)', filter: 'blur(40px)' }} />

              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  className={`absolute obsidian inner-glow rounded-xl p-5 w-72 ${i === 0 ? 'animate-float' : i === 1 ? 'animate-float-slow' : ''}`}
                  style={{
                    right: 20 + i * 15,
                    top: 40 + i * 50,
                    zIndex: 4 - i,
                    opacity: 1 - i * 0.15,
                  }}
                  initial={{ opacity: 0, x: 60, rotate: (i - 1.5) * 4 }}
                  animate={{ opacity: 1 - i * 0.15, x: 0, rotate: (i - 1.5) * 3 }}
                  transition={{ delay: 0.35 + i * 0.14, duration: 0.9, ease: EASE }}
                >
                  <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                    <FolderGit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span>{['vercel/next.js', 'facebook/react', 'rust-lang/rust', 'django/django'][i]}</span>
                  </div>
                  <p className="text-sm font-medium text-zinc-200 leading-snug mb-3">
                    {['Fix hydration mismatch in App Router', 'Fix accessibility labels in Dialog', 'Improve borrow checker error hint', 'Add test for DateTimeField edge case'][i]}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-mono">{['TypeScript', 'JavaScript', 'Rust', 'Python'][i]}</span>
                    <span className="text-xs text-zinc-500 flex items-center gap-1"><Star className="w-3 h-3 text-amber-500/60" strokeWidth={1.5} />{['120k', '215k', '89k', '74k'][i]}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="relative py-28 px-6 sm:px-8 lg:px-12" data-testid="how-it-works">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="max-w-7xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.8, ease: EASE }}>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-serif mb-3 tracking-tight">
              <span className="text-amber-500 font-mono text-2xl">//</span> How It Works
            </h2>
            <p className="text-zinc-400 text-base md:text-lg mb-16 max-w-lg">Four steps from idle to impact. Every contribution writes a new chapter.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {steps.map((step, i) => {
              const a = ACCENT_MAP[step.accent];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 25 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.75, ease: EASE }}
                  whileHover={{ scale: 1.02, y: -4 }}
                  className={`relative obsidian inner-glow rounded-xl p-6 group cursor-default ${a.border}`}
                >
                  <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100" style={{ background: `radial-gradient(300px circle at 50% 0%, ${a.glow}, transparent)`, transition: 'opacity 0.3s' }} />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-5">
                      <span className={`font-mono text-xs ${a.text} ${a.bg} w-7 h-7 rounded flex items-center justify-center font-bold border ${a.border}`}>{String(i + 1).padStart(2, '0')}</span>
                      <step.icon className={`w-5 h-5 ${a.text}`} strokeWidth={1.5} />
                    </div>
                    <h3 className="text-base font-semibold font-serif mb-2 text-zinc-100">{step.title}</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">{step.desc}</p>
                  </div>
                  {i < 3 && <ChevronRight className="hidden lg:block absolute -right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-700 z-10" />}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ STATS ═══ */}
      <section className="relative py-24 px-6 sm:px-8 lg:px-12" data-testid="stats-section">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(245,158,11,0.04) 0%, transparent 70%)' }} />
        <div className="relative max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { label: 'Issues Resolved', value: stats.issues_resolved, icon: GitPullRequest, accent: 'amber' },
              { label: 'Active Authors', value: stats.active_authors, icon: Users, accent: 'violet' },
              { label: 'Repositories Reached', value: stats.repositories_reached, icon: FolderGit2, accent: 'emerald' },
            ].map(({ label, value, icon: Icon, accent }, i) => {
              const a = ACCENT_MAP[accent];
              return (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.75, ease: EASE }}
                  className={`obsidian inner-glow rounded-xl p-7 ${a.border}`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-lg ${a.bg} border ${a.border}`}>
                      <Icon className={`w-4 h-4 ${a.text}`} strokeWidth={1.5} />
                    </div>
                    <span className="text-xs text-zinc-500 uppercase tracking-wider font-mono">{label}</span>
                  </div>
                  <p className={`text-4xl sm:text-5xl font-bold font-mono ${a.text}`}>
                    <AnimatedNumber target={value} />
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ ACTIVITY FEED ═══ */}
      {activity.length > 0 && (
        <section className="relative py-28 px-6 sm:px-8 lg:px-12" data-testid="activity-feed">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-serif mb-3 tracking-tight">
              <span className="text-amber-500 font-mono text-2xl">//</span> Recent Chapters
            </h2>
            <p className="text-zinc-400 text-base md:text-lg mb-12">Stories being written right now across the archive.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activity.slice(0, 6).map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.65, ease: EASE }}
                  whileHover={{ scale: 1.01, y: -2 }}
                  className="obsidian rounded-xl p-5 inner-glow border-white/[0.06] hover:border-amber-500/20 cursor-default"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <img src={a.avatar_url} alt="" className="w-8 h-8 rounded-full border border-white/10 bg-zinc-900" />
                    <span className="text-sm font-medium text-zinc-200">{a.username}</span>
                    <span className="text-xs text-zinc-600 font-mono ml-auto">{getTimeAgo(a.timestamp)}</span>
                  </div>
                  <p className="text-sm text-zinc-400">
                    merged a chapter in <span className="text-amber-500 font-medium">{a.repo}</span>
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ BOTTOM CTA ═══ */}
      <section className="relative py-28 px-6 sm:px-8 lg:px-12" data-testid="bottom-cta">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(245,158,11,0.06) 0%, transparent 60%)' }} />
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-serif mb-5 tracking-tight">
            Ready to Write<br /><span className="gold-text">Your Chapter?</span>
          </h2>
          <p className="text-zinc-400 text-base md:text-lg mb-10">
            Join developers crafting their open-source stories, one pull request at a time.
          </p>
          <button onClick={handleCTA} className="rune-btn px-10 py-4 rounded-lg text-sm tracking-widest animate-pulse-glow" data-testid="bottom-cta-button">
            Begin Your Story <ArrowRight className="w-4 h-4 inline ml-2" />
          </button>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="relative py-8 px-6 sm:px-8">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-zinc-600">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-500/60" strokeWidth={1.5} />
            <span className="font-serif font-medium text-zinc-400">GitFable</span>
          </div>
          <p className="font-mono text-xs">Every PR is a page in your legend.</p>
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
