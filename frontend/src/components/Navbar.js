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
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl" data-testid="navbar">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group" data-testid="nav-logo">
            <BookOpen className="w-6 h-6 text-amber-500 group-hover:scale-110" style={{ transition: 'transform 0.2s' }} />
            <span className="font-serif text-xl font-bold tracking-tight text-foreground">GitFable</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                data-testid={`nav-${label.toLowerCase()}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
                  location.pathname === path
                    ? 'text-amber-500 bg-amber-500/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}
                style={{ transition: 'color 0.15s, background-color 0.15s' }}
              >
                <Icon className="w-4 h-4" />
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
                  <button className="flex items-center gap-2 rounded-full" data-testid="user-menu-trigger">
                    <Avatar className="w-8 h-8 border border-border">
                      <AvatarImage src={user.avatar_url} alt={user.username} />
                      <AvatarFallback>{user.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="hidden md:inline text-sm font-medium text-foreground">{user.username}</span>
                    <span className="hidden md:inline text-xs font-mono text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                      Lv.{user.level}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                  <DropdownMenuItem onClick={() => navigate(`/u/${user.username}`)} data-testid="menu-profile">
                    <User className="w-4 h-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/dashboard')} data-testid="menu-dashboard">
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} data-testid="menu-logout">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                onClick={() => setShowLogin(true)}
                className="bg-amber-500 text-black hover:bg-amber-400 font-semibold"
                data-testid="sign-in-button"
              >
                <Github className="w-4 h-4 mr-2" />
                Sign In
              </Button>
            )}
          </div>
        </div>

        {/* Mobile nav */}
        {user && (
          <div className="md:hidden flex items-center justify-around border-t border-border/50 py-2 px-2">
            {navLinks.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                data-testid={`mobile-nav-${label.toLowerCase()}`}
                className={`flex flex-col items-center gap-1 px-3 py-1 rounded-md text-xs ${
                  location.pathname === path ? 'text-amber-500' : 'text-muted-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <Dialog open={showLogin} onOpenChange={setShowLogin}>
        <DialogContent className="bg-card border-border sm:max-w-md" data-testid="login-dialog">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-center">Begin Your Story</DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              Sign in with your GitHub username to start your open-source journey.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLogin} className="space-y-4 mt-4">
            <div className="relative">
              <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Enter your GitHub username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-10 bg-secondary border-border h-12 text-base"
                data-testid="login-username-input"
                autoFocus
              />
            </div>
            <Button
              type="submit"
              disabled={loginLoading || !username.trim()}
              className="w-full bg-amber-500 text-black hover:bg-amber-400 font-semibold h-12 text-base"
              data-testid="login-submit-button"
            >
              {loginLoading ? 'Signing in...' : 'Enter the Archive'}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Mock authentication for demo purposes. No real GitHub access required.
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
