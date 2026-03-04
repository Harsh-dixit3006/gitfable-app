import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    <div className="pt-20 px-4 md:px-8 lg:px-12 max-w-4xl mx-auto">
      <div className="grid gap-6 mt-8">{[1,2].map(i => <div key={i} className="h-40 rounded-xl shimmer" />)}</div>
    </div>
  );

  if (error) return (
    <div className="pt-20 px-4 text-center">
      <p className="text-muted-foreground text-lg mt-20">{error}</p>
    </div>
  );

  const u = profile;
  const earned = new Set((u.badges || []).map(b => b.name));

  return (
    <div className="pt-20 pb-16 px-4 md:px-8 lg:px-12 max-w-4xl mx-auto" data-testid="profile-page">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="flex items-center gap-6 mb-10" data-testid="profile-header">
          <Avatar className="w-20 h-20 border-2 border-amber-500/30">
            <AvatarImage src={u.avatar_url} />
            <AvatarFallback className="text-2xl font-serif">{u.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl sm:text-3xl font-bold font-serif">{u.display_name || u.username}</h1>
              <span className="text-sm font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded font-bold">Lv.{u.level}</span>
            </div>
            <p className="text-muted-foreground text-sm mb-1">@{u.username}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Joined {new Date(u.joined_at).toLocaleDateString()}</span>
              <span className="font-mono text-amber-500">{u.xp} XP</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10" data-testid="profile-stats">
          {[
            { label: 'Contributions', value: u.total_contributions, icon: GitPullRequest },
            { label: 'Current Streak', value: u.current_streak, icon: Flame },
            { label: 'Longest Streak', value: u.longest_streak, icon: Trophy },
            { label: 'Level', value: u.level, icon: Star },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="border-border/50">
              <CardContent className="p-4">
                <Icon className="w-4 h-4 text-amber-500 mb-2" />
                <p className="text-2xl font-bold font-mono">{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Badges */}
        <Card className="mb-10 border-border/50" data-testid="profile-badges">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Badges</CardTitle>
          </CardHeader>
          <CardContent>
            <TooltipProvider>
              <div className="grid grid-cols-5 md:grid-cols-10 gap-3">
                {Object.entries(BADGE_ICONS).map(([name, Icon]) => {
                  const isEarned = earned.has(name);
                  return (
                    <Tooltip key={name}>
                      <TooltipTrigger asChild>
                        <div className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border ${
                          isEarned ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/30 bg-secondary/30 opacity-40'
                        }`}>
                          <Icon className={`w-6 h-6 ${isEarned ? 'text-amber-500' : 'text-zinc-600'}`} />
                          <span className="text-[10px] text-center leading-tight">{name}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="bg-card border-border"><p className="text-xs">{name}</p></TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>

        {/* Recent Merges */}
        <Card className="border-border/50" data-testid="recent-merges">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Recent Chapters</CardTitle>
          </CardHeader>
          <CardContent>
            {merges.length === 0 ? (
              <p className="text-sm text-muted-foreground">No merged PRs yet.</p>
            ) : (
              <div className="space-y-3">
                {merges.map(m => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <FolderGit2 className="w-3.5 h-3.5" />
                        <span className="truncate">{m.repo}</span>
                      </div>
                      <p className="text-sm font-medium truncate">{m.title}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-400 shrink-0">
                      Merged
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
