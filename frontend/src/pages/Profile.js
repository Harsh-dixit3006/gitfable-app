import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion } from 'framer-motion';
import { Star, Flame, Trophy, GitPullRequest, Calendar, FolderGit2, BookOpen, Files, Library, BookCopy, MoonStar, FastForward, PenTool, Globe, Search, Bookmark as BookmarkIcon } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BADGE_ICONS = {
  'Prologue': BookOpen, 'Short Story': Files, 'The Epic': Library,
  'Anthology': BookCopy, 'Midnight Draft': MoonStar, 'Fast Forward': FastForward,
  'Daily Author': PenTool, 'Worldbuilder': Globe, 'Proofreader': Search,
  'The Archivist': BookmarkIcon,
};

export default function Profile() {
  const { username } = useParams();
  const [profile, setProfile] = useState(null);
  const [merges, setMerges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios.get(`${API}/profile/${username}`)
      .then(r => { setProfile(r.data.user); setMerges(r.data.recent_merges || []); })
      .catch(err => setError(err.response?.data?.detail || 'User not found'))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) return (
    <div className="pt-20 px-6 sm:px-8 lg:px-12 max-w-4xl mx-auto">
      <div className="grid gap-4 mt-8">{[1,2].map(i => <div key={i} className="h-40 rounded-xl shimmer" />)}</div>
    </div>
  );

  if (error) return (
    <div className="pt-20 px-6 text-center">
      <p className="text-zinc-500 text-lg mt-20 font-mono">{error}</p>
    </div>
  );

  const u = profile;
  const earned = new Set((u.badges || []).map(b => b.name));

  return (
    <div className="pt-20 pb-16 relative" data-testid="profile-page">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />

      <div className="max-w-4xl mx-auto px-6 sm:px-8 lg:px-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="obsidian inner-glow rounded-xl p-8 mb-8" data-testid="profile-header">
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="absolute -inset-2 rounded-full bg-amber-500/20 blur-lg" />
                <Avatar className="relative w-20 h-20 border-2 border-amber-500/30">
                  <AvatarImage src={u.avatar_url} />
                  <AvatarFallback className="text-2xl font-serif bg-zinc-900">{u.username?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl sm:text-3xl font-bold font-serif">{u.display_name || u.username}</h1>
                  <span className="text-xs font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-bold">Lv.{u.level}</span>
                </div>
                <p className="text-zinc-500 text-sm font-mono mb-2">@{u.username}</p>
                <div className="flex items-center gap-4 text-xs font-mono text-zinc-600">
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />Joined {new Date(u.joined_at).toLocaleDateString()}</span>
                  <span className="text-amber-500 font-bold">{u.xp} XP</span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="profile-stats">
            {[
              { label: 'Contributions', value: u.total_contributions, icon: GitPullRequest, color: 'text-emerald-400', border: 'border-emerald-500/20' },
              { label: 'Current Streak', value: u.current_streak, icon: Flame, color: 'text-amber-500', border: 'border-amber-500/20' },
              { label: 'Longest Streak', value: u.longest_streak, icon: Trophy, color: 'text-violet-400', border: 'border-violet-500/20' },
              { label: 'Level', value: u.level, icon: Star, color: 'text-amber-500', border: 'border-amber-500/20' },
            ].map(({ label, value, icon: Icon, color, border }) => (
              <div key={label} className={`obsidian rounded-xl p-5 ${border}`}>
                <Icon className={`w-4 h-4 ${color} mb-2`} strokeWidth={1.5} />
                <p className="text-2xl font-bold font-mono text-zinc-100">{value}</p>
                <p className="text-xs text-zinc-600 font-mono mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Badges */}
          <div className="obsidian inner-glow rounded-xl p-6 mb-8" data-testid="profile-badges">
            <h3 className="font-serif text-lg font-semibold mb-4">
              <span className="text-amber-500 font-mono text-sm">//</span> Badges
            </h3>
            <TooltipProvider>
              <div className="grid grid-cols-5 md:grid-cols-10 gap-3">
                {Object.entries(BADGE_ICONS).map(([name, Icon]) => {
                  const isEarned = earned.has(name);
                  return (
                    <Tooltip key={name}>
                      <TooltipTrigger asChild>
                        <motion.div whileHover={{ scale: 1.08, y: -2 }}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border cursor-default ${
                            isEarned ? 'border-amber-500/30 bg-amber-500/5 shadow-[0_0_15px_-5px_rgba(245,158,11,0.3)]' : 'border-white/5 bg-zinc-900/30 opacity-35'
                          }`}>
                          <Icon className={`w-6 h-6 ${isEarned ? 'text-amber-500' : 'text-zinc-700'}`} strokeWidth={1.5} />
                          <span className="text-[10px] text-center leading-tight font-mono">{name}</span>
                        </motion.div>
                      </TooltipTrigger>
                      <TooltipContent className="bg-zinc-900 border-white/10"><p className="text-xs">{name}</p></TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>

          {/* Recent Merges */}
          <div className="obsidian inner-glow rounded-xl p-6" data-testid="recent-merges">
            <h3 className="font-serif text-lg font-semibold mb-4">
              <span className="text-amber-500 font-mono text-sm">//</span> Recent Chapters
            </h3>
            {merges.length === 0 ? (
              <p className="text-sm text-zinc-600 font-mono">No merged PRs yet.</p>
            ) : (
              <div className="space-y-2">
                {merges.map(m => (
                  <motion.div key={m.id} whileHover={{ scale: 1.005 }} className="p-4 rounded-lg bg-zinc-900/50 border border-white/5 hover:border-white/10 cursor-default">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-zinc-600 font-mono mb-0.5">
                          <FolderGit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          <span className="truncate">{m.repo}</span>
                        </div>
                        <p className="text-sm font-medium text-zinc-300 truncate">{m.title}</p>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-md font-mono status-merged shrink-0">Merged</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
