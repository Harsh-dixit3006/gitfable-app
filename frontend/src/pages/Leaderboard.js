import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { motion } from 'framer-motion';
import { Crown, Medal, Flame } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PODIUM_CONFIG = [
  { accent: 'amber', border: 'border-amber-500/40', glow: '0 0 30px -6px rgba(245,158,11,0.4)', icon: Crown, color: 'text-amber-500', bgGlow: 'rgba(245,158,11,0.08)' },
  { accent: 'zinc', border: 'border-zinc-400/20', glow: 'none', icon: Medal, color: 'text-zinc-400', bgGlow: 'rgba(255,255,255,0.02)' },
  { accent: 'orange', border: 'border-orange-700/30', glow: 'none', icon: Medal, color: 'text-orange-600', bgGlow: 'rgba(234,88,12,0.04)' },
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
    <div className="pt-20 pb-16 relative" data-testid="leaderboard-page">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />

      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-serif mb-2 tracking-tight">
            <span className="text-amber-500 font-mono text-xl">//</span> Leaderboard
          </h1>
          <p className="text-zinc-400 text-base md:text-lg mb-8">The most prolific authors of open source.</p>

          <Tabs value={period} onValueChange={setPeriod} className="mb-10">
            <TabsList className="bg-zinc-950/80 border border-white/5 p-1">
              {['weekly', 'monthly', 'all-time'].map(p => (
                <TabsTrigger key={p} value={p} data-testid={`tab-${p}`}
                  className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500 data-[state=active]:border-amber-500/30 data-[state=active]:shadow-[0_0_10px_-3px_rgba(245,158,11,0.3)] font-mono text-xs uppercase tracking-wider border border-transparent rounded-md px-4 py-2">
                  {p === 'all-time' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {loading ? (
            <div className="grid gap-4">{[1,2,3].map(i => <div key={i} className="h-24 rounded-xl shimmer" />)}</div>
          ) : (
            <>
              {/* Podium */}
              {top3.length >= 3 && (
                <div className="flex items-end justify-center gap-4 mb-12" data-testid="podium">
                  {[1, 0, 2].map((idx) => {
                    const u = top3[idx];
                    const cfg = PODIUM_CONFIG[idx];
                    const isFirst = idx === 0;
                    return (
                      <motion.div
                        key={u.username}
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 + 0.2 }}
                        whileHover={{ scale: 1.03, y: -4 }}
                        className={`relative obsidian rounded-xl cursor-pointer ${cfg.border} ${isFirst ? 'w-56 p-6 pb-8' : 'w-44 p-5 pb-7'}`}
                        style={{ boxShadow: cfg.glow }}
                        onClick={() => navigate(`/u/${u.username}`)}
                        data-testid={`podium-${idx + 1}`}
                      >
                        {/* Ambient glow */}
                        <div className="absolute inset-0 rounded-xl" style={{ background: `radial-gradient(200px circle at 50% 30%, ${cfg.bgGlow}, transparent)` }} />
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                        <div className="relative flex flex-col items-center text-center">
                          <cfg.icon className={`w-5 h-5 ${cfg.color} mb-3`} strokeWidth={1.5} />
                          <div className="relative mb-3">
                            {isFirst && <div className="absolute -inset-1.5 rounded-full bg-amber-500/20 blur-md" />}
                            <Avatar className={`relative ${isFirst ? 'w-16 h-16' : 'w-12 h-12'} border-2 ${cfg.border}`}>
                              <AvatarImage src={u.avatar_url} />
                              <AvatarFallback className="bg-zinc-900 font-serif">{u.username?.[0]?.toUpperCase()}</AvatarFallback>
                            </Avatar>
                          </div>
                          <p className="font-medium text-sm truncate max-w-full text-zinc-200">{u.username}</p>
                          <p className="text-xs font-mono text-amber-500 mt-1 font-bold">{u.xp?.toLocaleString()} XP</p>
                          <p className="text-xs text-zinc-600 font-mono">Lv.{u.level}</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Table */}
              <div className="obsidian rounded-xl overflow-hidden inner-glow" data-testid="leaderboard-table">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="w-14 text-center font-mono text-xs text-zinc-600">#</TableHead>
                      <TableHead className="font-mono text-xs text-zinc-600">Author</TableHead>
                      <TableHead className="text-right font-mono text-xs text-zinc-600">Level</TableHead>
                      <TableHead className="text-right font-mono text-xs text-zinc-600">XP</TableHead>
                      <TableHead className="text-right font-mono text-xs text-zinc-600 hidden sm:table-cell">Contribs</TableHead>
                      <TableHead className="text-right font-mono text-xs text-zinc-600 hidden sm:table-cell">Streak</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rest.map((u) => (
                      <TableRow
                        key={u.username}
                        className={`border-white/[0.03] cursor-pointer hover:bg-white/[0.02] ${
                          user?.username === u.username ? 'bg-amber-500/[0.04] border-l-2 border-l-amber-500/50' : ''
                        }`}
                        onClick={() => navigate(`/u/${u.username}`)}
                        data-testid={`leaderboard-row-${u.rank}`}
                      >
                        <TableCell className="text-center font-mono text-xs text-zinc-600">{u.rank}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-7 h-7 border border-white/5">
                              <AvatarImage src={u.avatar_url} />
                              <AvatarFallback className="text-xs bg-zinc-900">{u.username?.[0]?.toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-sm text-zinc-300">{u.username}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-amber-500">Lv.{u.level}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-zinc-300">{u.xp?.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-zinc-500 hidden sm:table-cell">{u.total_contributions}</TableCell>
                        <TableCell className="text-right hidden sm:table-cell">
                          <span className="flex items-center justify-end gap-1 text-xs font-mono">
                            {u.current_streak > 0 && <Flame className="w-3 h-3 text-amber-500" />}
                            <span className="text-zinc-400">{u.current_streak}</span>
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pinned user row */}
              {user && !users.find(u => u.username === user.username) && (
                <div className="fixed bottom-0 left-0 right-0 border-t border-amber-500/20 bg-zinc-950/95 backdrop-blur-xl py-3 px-6 z-40" data-testid="pinned-user-row">
                  <div className="max-w-5xl mx-auto flex items-center gap-4">
                    <span className="text-xs text-zinc-600 font-mono w-8 text-center">--</span>
                    <Avatar className="w-7 h-7 border border-white/5">
                      <AvatarImage src={user.avatar_url} />
                      <AvatarFallback className="bg-zinc-900">{user.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm flex-1 text-zinc-300">{user.username}</span>
                    <span className="font-mono text-xs text-amber-500 font-bold">{user.xp} XP</span>
                    <span className="font-mono text-xs text-zinc-600">Lv.{user.level}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
