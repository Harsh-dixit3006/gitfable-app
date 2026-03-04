import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { motion } from 'framer-motion';
import { Crown, Medal, Trophy, Flame, Star } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PODIUM_STYLES = [
  { border: 'border-amber-500/40', glow: '0 0 24px -6px rgba(245,158,11,0.35)', icon: Crown, color: 'text-amber-500', label: '1st' },
  { border: 'border-zinc-400/30', glow: 'none', icon: Medal, color: 'text-zinc-400', label: '2nd' },
  { border: 'border-orange-700/30', glow: 'none', icon: Medal, color: 'text-orange-600', label: '3rd' },
];

export default function Leaderboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('all-time');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/leaderboard?period=${period}`)
      .then(r => setUsers(r.data.users || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const top3 = users.slice(0, 3);
  const rest = users.slice(3);

  return (
    <div className="pt-20 pb-16 px-4 md:px-8 lg:px-12 max-w-5xl mx-auto" data-testid="leaderboard-page">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Leaderboard</h1>
        <p className="text-muted-foreground text-base md:text-lg mb-8">The most prolific authors of open source.</p>

        <Tabs value={period} onValueChange={setPeriod} className="mb-10">
          <TabsList className="bg-secondary/50 border border-border/50">
            <TabsTrigger value="weekly" data-testid="tab-weekly" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">Weekly</TabsTrigger>
            <TabsTrigger value="monthly" data-testid="tab-monthly" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">Monthly</TabsTrigger>
            <TabsTrigger value="all-time" data-testid="tab-all-time" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">All Time</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="grid gap-4">{[1,2,3].map(i => <div key={i} className="h-20 rounded-xl shimmer" />)}</div>
        ) : (
          <>
            {/* Podium */}
            {top3.length >= 3 && (
              <div className="flex items-end justify-center gap-4 mb-12" data-testid="podium">
                {[1, 0, 2].map((idx) => {
                  const u = top3[idx];
                  const s = PODIUM_STYLES[idx];
                  const isFirst = idx === 0;
                  return (
                    <motion.div
                      key={u.username}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={`flex flex-col items-center p-5 rounded-xl border bg-card cursor-pointer ${s.border} ${isFirst ? 'w-52 pb-8' : 'w-44 pb-6'}`}
                      style={{ boxShadow: s.glow }}
                      onClick={() => navigate(`/u/${u.username}`)}
                      data-testid={`podium-${idx + 1}`}
                    >
                      <s.icon className={`w-5 h-5 ${s.color} mb-3`} />
                      <Avatar className={`${isFirst ? 'w-16 h-16' : 'w-12 h-12'} border-2 ${s.border} mb-3`}>
                        <AvatarImage src={u.avatar_url} />
                        <AvatarFallback>{u.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <p className="font-medium text-sm truncate max-w-full">{u.username}</p>
                      <p className="text-xs font-mono text-amber-500 mt-1">{u.xp?.toLocaleString()} XP</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Lv.{u.level}</p>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Table */}
            <div className="rounded-xl border border-border/50 bg-card overflow-hidden" data-testid="leaderboard-table">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="w-16 text-center">#</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead className="text-right">Level</TableHead>
                    <TableHead className="text-right">XP</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Contributions</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Streak</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rest.map((u) => (
                    <TableRow
                      key={u.username}
                      className={`border-border/30 cursor-pointer hover:bg-secondary/30 ${user?.username === u.username ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : ''}`}
                      onClick={() => navigate(`/u/${u.username}`)}
                      data-testid={`leaderboard-row-${u.rank}`}
                    >
                      <TableCell className="text-center font-mono text-sm text-muted-foreground">{u.rank}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="w-7 h-7">
                            <AvatarImage src={u.avatar_url} />
                            <AvatarFallback className="text-xs">{u.username?.[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-sm">{u.username}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-amber-500">Lv.{u.level}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{u.xp?.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-sm hidden sm:table-cell">{u.total_contributions}</TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        <span className="flex items-center justify-end gap-1 text-sm">
                          {u.current_streak > 0 && <Flame className="w-3.5 h-3.5 text-amber-500" />}
                          <span className="font-mono">{u.current_streak}</span>
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pinned user row */}
            {user && !rest.find(u => u.username === user.username) && !top3.find(u => u.username === user.username) && (
              <div className="fixed bottom-0 left-0 right-0 border-t border-amber-500/20 bg-card/95 backdrop-blur-xl py-3 px-4 md:px-8 z-40" data-testid="pinned-user-row">
                <div className="max-w-5xl mx-auto flex items-center gap-4">
                  <span className="text-sm text-muted-foreground font-mono">--</span>
                  <Avatar className="w-7 h-7">
                    <AvatarImage src={user.avatar_url} />
                    <AvatarFallback>{user.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-sm flex-1">{user.username}</span>
                  <span className="font-mono text-sm text-amber-500">{user.xp} XP</span>
                  <span className="font-mono text-sm text-muted-foreground">Lv.{user.level}</span>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
