import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { BookOpen, Compass, LayoutDashboard, Trophy, Clock, LogOut, Github, User } from 'lucide-react';
import { toast } from 'sonner';

const navLinks = [
  { path: '/discover', label: 'Discover', icon: Compass },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { path: '/history', label: 'History', icon: Clock },
];

export default function Navbar() {
  const { user, login, logout, showLogin, setShowLogin, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoginLoading(true);
    try {
      await login(username.trim());
      setShowLogin(false);
      setUsername('');
      toast.success('Welcome to GitFable!');
      navigate('/discover');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-40 border-b border-white/[0.04] bg-zinc-950/80 backdrop-blur-2xl" data-testid="navbar">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group" data-testid="nav-logo">
            <BookOpen className="w-5 h-5 text-amber-500 group-hover:scale-110" strokeWidth={1.5} style={{ transition: 'transform 0.2s' }} />
            <span className="font-serif text-lg font-bold tracking-tight text-zinc-100">GitFable</span>
          </Link>

          <div className="hidden md:flex items-center gap-0.5">
            {navLinks.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                data-testid={`nav-${label.toLowerCase()}`}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-mono uppercase tracking-wider ${
                  location.pathname === path
                    ? 'text-amber-500 bg-amber-500/10 border border-amber-500/20'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03] border border-transparent'
                }`}
                style={{ transition: 'color 0.15s, background-color 0.15s, border-color 0.15s' }}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                {label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {loading ? (
              <div className="w-8 h-8 rounded-full shimmer" />
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03] border border-transparent hover:border-white/5" style={{ transition: 'background-color 0.15s, border-color 0.15s' }} data-testid="user-menu-trigger">
                    <Avatar className="w-7 h-7 border border-white/10">
                      <AvatarImage src={user.avatar_url} alt={user.username} />
                      <AvatarFallback className="bg-zinc-900 text-xs">{user.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="hidden md:inline text-xs font-mono text-zinc-300">{user.username}</span>
                    <span className="hidden md:inline text-[10px] font-mono text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      Lv.{user.level}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-zinc-950 border-white/10">
                  <DropdownMenuItem onClick={() => navigate(`/u/${user.username}`)} data-testid="menu-profile" className="font-mono text-xs text-zinc-300 focus:bg-white/5 focus:text-zinc-100">
                    <User className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/dashboard')} data-testid="menu-dashboard" className="font-mono text-xs text-zinc-300 focus:bg-white/5 focus:text-zinc-100">
                    <LayoutDashboard className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/5" />
                  <DropdownMenuItem onClick={logout} data-testid="menu-logout" className="font-mono text-xs text-zinc-500 focus:bg-red-500/5 focus:text-red-400">
                    <LogOut className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button onClick={() => setShowLogin(true)} className="rune-btn px-5 py-2 rounded-md flex items-center gap-2" data-testid="sign-in-button">
                <Github className="w-3.5 h-3.5" strokeWidth={1.5} />
                Sign In
              </button>
            )}
          </div>
        </div>

        {/* Mobile nav */}
        {user && (
          <div className="md:hidden flex items-center justify-around border-t border-white/[0.04] py-2 px-2">
            {navLinks.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                data-testid={`mobile-nav-${label.toLowerCase()}`}
                className={`flex flex-col items-center gap-1 px-3 py-1 rounded-md text-[10px] font-mono uppercase ${
                  location.pathname === path ? 'text-amber-500' : 'text-zinc-600'
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={1.5} />
                {label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <Dialog open={showLogin} onOpenChange={setShowLogin}>
        <DialogContent className="bg-zinc-950 border-white/10 sm:max-w-md" data-testid="login-dialog" aria-describedby="login-dialog-description">
          <div className="absolute inset-0 rounded-lg" style={{ background: 'radial-gradient(300px circle at 50% 0%, rgba(245,158,11,0.06), transparent)' }} />
          <DialogHeader className="relative">
            <DialogTitle className="font-serif text-2xl text-center">Begin Your Story</DialogTitle>
            <DialogDescription id="login-dialog-description" className="text-center text-zinc-500 text-sm">
              Sign in with your GitHub username to enter the archive.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLogin} className="space-y-4 mt-4 relative">
            <div className="relative">
              <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" strokeWidth={1.5} />
              <Input
                type="text"
                placeholder="GitHub username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-10 bg-zinc-900 border-white/10 h-12 text-sm font-mono focus:border-amber-500/30 focus:ring-amber-500/20"
                data-testid="login-username-input"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loginLoading || !username.trim()}
              className="rune-btn w-full py-3.5 rounded-lg text-center text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="login-submit-button"
            >
              {loginLoading ? 'Entering...' : 'Enter the Archive'}
            </button>
            <p className="text-[10px] text-center text-zinc-600 font-mono">
              Mock authentication for demo. No real GitHub access required.
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
