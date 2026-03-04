import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Compass, GitPullRequest, Award, Star, Users, FolderGit2, ChevronRight } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function AnimatedNumber({ target, duration = 2000 }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (target <= 0) return;
    const steps = 40;
    const increment = target / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      setCurrent(Math.min(Math.round(increment * step), target));
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
    return () => clearInterval(timer);
  }, [target, duration]);
  return <span className="font-mono">{current.toLocaleString()}</span>;
}

const steps = [
  { icon: Compass, title: 'Set Your Filters', desc: 'Choose languages and difficulty levels that match your skills.' },
  { icon: BookOpen, title: 'Draw an Issue', desc: 'The archive shuffles and presents a curated open-source issue.' },
  { icon: GitPullRequest, title: 'Submit Your PR', desc: 'Work on the issue, submit a pull request on GitHub.' },
  { icon: Award, title: 'Earn Your Legend', desc: 'Gain XP, unlock badges, and climb the leaderboard.' },
];

export default function Landing() {
  const { user, setShowLogin } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ issues_resolved: 0, active_authors: 0, repositories_reached: 0 });
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    axios.get(`${API}/stats`).then(r => setStats(r.data)).catch(() => {});
    axios.get(`${API}/activity`).then(r => setActivity(r.data)).catch(() => {});
  }, []);

  const handleCTA = () => {
    if (user) navigate('/discover');
    else setShowLogin(true);
  };

  return (
    <div className="pt-16" data-testid="landing-page">
      {/* Hero */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.08) 0%, transparent 60%)' }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />

        <div className="relative max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-20 w-full">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 text-amber-500 text-sm mb-8">
              <Star className="w-3.5 h-3.5" />
              <span>Your open-source journey starts here</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight mb-6">
              Write Your<br />
              <span className="text-amber-500">Open Source Story</span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-xl mb-10 leading-relaxed">
              GitFable matches you with curated open-source issues. Draw your next contribution,
              earn XP, collect badges, and build your developer legend.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button
                onClick={handleCTA}
                className="bg-amber-500 text-black hover:bg-amber-400 font-semibold h-12 px-8 text-base rounded-md"
                data-testid="hero-cta-button"
              >
                Begin Your Story
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/leaderboard')}
                className="h-12 px-6 text-base border-border hover:bg-secondary/50 rounded-md"
                data-testid="hero-leaderboard-button"
              >
                View Leaderboard
              </Button>
            </div>
          </motion.div>

          {/* Floating cards */}
          <div className="hidden lg:block absolute right-12 top-1/2 -translate-y-1/2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute w-64 h-40 rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-5"
                style={{ right: i * 20, top: i * 30 - 40, zIndex: 3 - i }}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1 - i * 0.2, x: 0, y: [0, -8, 0] }}
                transition={{ delay: 0.3 + i * 0.15, y: { repeat: Infinity, duration: 3 + i, ease: 'easeInOut' } }}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <FolderGit2 className="w-3.5 h-3.5" />
                  <span>{['vercel/next.js', 'facebook/react', 'rust-lang/rust'][i]}</span>
                </div>
                <p className="text-sm font-medium text-foreground leading-snug">
                  {['Fix hydration mismatch in App Router', 'Fix accessibility labels in Dialog', 'Improve borrow checker error hint'][i]}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-500">{['TypeScript', 'JavaScript', 'Rust'][i]}</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Star className="w-3 h-3" />{['120k', '215k', '89k'][i]}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-4 md:px-8 lg:px-12" data-testid="how-it-works">
        <div className="max-w-7xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground text-base md:text-lg mb-16 max-w-lg">Four steps from idle to impact. Every contribution writes a new chapter.</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative group"
              >
                <div className="p-6 rounded-xl border border-border/50 bg-card/50 hover:border-amber-500/30 h-full" style={{ transition: 'border-color 0.2s' }}>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-xs font-mono text-amber-500 bg-amber-500/10 w-7 h-7 rounded-md flex items-center justify-center font-bold">{i + 1}</span>
                    <step.icon className="w-5 h-5 text-amber-500" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 font-serif">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
                {i < 3 && <ChevronRight className="hidden lg:block absolute -right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-border" />}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 px-4 md:px-8 lg:px-12 border-y border-border/50" data-testid="stats-section">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              { label: 'Issues Resolved', value: stats.issues_resolved, icon: GitPullRequest },
              { label: 'Active Authors', value: stats.active_authors, icon: Users },
              { label: 'Repositories Reached', value: stats.repositories_reached, icon: FolderGit2 },
            ].map(({ label, value, icon: Icon }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-left"
              >
                <Icon className="w-5 h-5 text-amber-500 mb-3" />
                <p className="text-4xl sm:text-5xl font-bold text-amber-500 mb-2">
                  <AnimatedNumber target={value} />
                </p>
                <p className="text-sm text-muted-foreground uppercase tracking-wider">{label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Activity Feed */}
      {activity.length > 0 && (
        <section className="py-24 px-4 md:px-8 lg:px-12" data-testid="activity-feed">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Recent Chapters</h2>
            <p className="text-muted-foreground text-base md:text-lg mb-12">Stories being written right now.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activity.slice(0, 6).map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card rounded-xl p-5 hover:border-amber-500/20"
                  style={{ transition: 'border-color 0.2s' }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <img src={a.avatar_url} alt="" className="w-8 h-8 rounded-full border border-border" />
                    <span className="text-sm font-medium text-foreground">{a.username}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{getTimeAgo(a.timestamp)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    merged a chapter in <span className="text-amber-500 font-medium">{a.repo}</span>
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Bottom CTA */}
      <section className="py-24 px-4 md:px-8 lg:px-12" data-testid="bottom-cta">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Write Your Chapter?</h2>
          <p className="text-base md:text-lg text-muted-foreground mb-8">
            Join a community of developers crafting their open-source stories, one pull request at a time.
          </p>
          <Button
            onClick={handleCTA}
            className="bg-amber-500 text-black hover:bg-amber-400 font-semibold h-12 px-8 text-base rounded-md"
            data-testid="bottom-cta-button"
          >
            Begin Your Story
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 px-4 md:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-500" />
            <span className="font-serif font-medium text-foreground">GitFable</span>
          </div>
          <p>Every PR is a page in your legend.</p>
        </div>
      </footer>
    </div>
  );
}

function getTimeAgo(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - new Date(timestamp).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
