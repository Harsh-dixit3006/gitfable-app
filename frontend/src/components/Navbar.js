import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { BookOpen, Compass, LayoutDashboard, Trophy, Clock, LogOut, Github, User, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { colors, accent } from '@/lib/theme';

const navLinks = [
  { path: '/discover', label: 'Discover', icon: Compass },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { path: '/history', label: 'History', icon: Clock },
];

export default function Navbar() {
  const { 
    user, 
    signInWithGithub, 
    registerUser, 
    logout, 
    showLogin, 
    setShowLogin, 
    loading, 
    isRegistering,
    firebaseUser,
  } = useAuth();
  const [username, setUsername] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleGithubLogin = async () => {
    setLoginLoading(true);
    try {
      const result = await signInWithGithub();
      if (!result.success) {
        if (result.error !== 'Sign in cancelled') {
          toast.error(result.error);
        }
      } else if (!result.needsRegistration) {
        toast.success('Welcome to GitFable!');
        navigate('/discover');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoginLoading(true);
    try {
      const result = await registerUser(username.trim());
      if (result.success) {
        toast.success('Welcome to GitFable!');
        setShowLogin(false);
        setUsername('');
        navigate('/discover');
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-40 border-b border-white/[0.04] bg-zinc-950/80 backdrop-blur-2xl" data-testid="navbar">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group" data-testid="nav-logo">
            <BookOpen className={`w-5 h-5 ${accent.textBright} group-hover:scale-110`} strokeWidth={1.5} style={{ transition: 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)' }} />
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
                    ? `${accent.text} bg-white/[0.06] border ${accent.borderBright} shadow-[0_0_18px_-10px_rgba(${colors.accent.rgb},0.7)]`
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
                    <span className={`hidden md:inline text-[10px] font-mono ${accent.text} bg-white/[0.06] px-1.5 py-0.5 rounded border ${accent.border}`}>
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
                  location.pathname === path ? accent.text : 'text-zinc-600'
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
          <div className="absolute inset-0 rounded-lg" style={{ background: `radial-gradient(300px circle at 50% 0%, rgba(${colors.accent.rgb},0.08), transparent)` }} />
          <DialogHeader className="relative">
            <DialogTitle className="font-serif text-2xl text-center">
              {isRegistering ? 'Complete Your Profile' : 'Begin Your Story'}
            </DialogTitle>
            <DialogDescription id="login-dialog-description" className="text-center text-zinc-500 text-sm">
              {isRegistering 
                ? 'Choose a username to complete your registration.' 
                : 'Sign in with GitHub to enter the archive.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4 relative">
            {!isRegistering ? (
              <>
                <button
                  onClick={handleGithubLogin}
                  disabled={loginLoading}
                  className="w-full py-3.5 px-4 rounded-lg bg-white text-zinc-950 font-medium flex items-center justify-center gap-3 hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="github-signin-button"
                >
                  {loginLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Github className="w-5 h-5" />
                  )}
                  {loginLoading ? 'Signing in...' : 'Continue with GitHub'}
                </button>
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-zinc-950 px-2 text-zinc-500">or</span>
                  </div>
                </div>
                
                <p className="text-[10px] text-center text-zinc-600 font-mono">
                  For demo purposes, you can also use the legacy mock login.
                </p>
              </>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="text-center mb-4">
                  <Avatar className={`w-16 h-16 mx-auto border-2 ${accent.borderBright}`}>
                    <AvatarImage src={firebaseUser?.photoURL} />
                    <AvatarFallback className="bg-zinc-900 text-xl">
                      {firebaseUser?.displayName?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <p className="mt-2 text-sm text-zinc-300">{firebaseUser?.email}</p>
                </div>
                
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm font-mono">@</span>
                  <Input
                    type="text"
                    placeholder="Choose a username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={`pl-10 bg-zinc-900 border-white/10 h-12 text-sm font-mono ${accent.focusBorder} ${accent.focusRing}`}
                    data-testid="register-username-input"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={loginLoading || !username.trim()}
                  className="rune-btn w-full py-3.5 rounded-lg text-center text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="register-submit-button"
                >
                  {loginLoading ? 'Creating Account...' : 'Create Account'}
                </button>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
