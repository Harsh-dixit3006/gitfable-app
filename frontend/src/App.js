import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "sonner";
import Navbar from "@/components/Navbar";
import Landing from "@/pages/Landing";
import Discover from "@/pages/Discover";
import Dashboard from "@/pages/Dashboard";
import Leaderboard from "@/pages/Leaderboard";
import History from "@/pages/History";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import AuthCallback from "@/pages/AuthCallback";
import RequireAuth from "@/components/RequireAuth";


function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-background relative">
          <div className="noise-overlay" />
          <div className="grid-bg-animated fixed inset-0 pointer-events-none opacity-40" />
          <Navbar />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/discover" element={<RequireAuth><Discover /></RequireAuth>} />
            <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/leaderboard" element={<RequireAuth><Leaderboard /></RequireAuth>} />
            <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
             <Route path="/u/:username" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#09090B',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#FAFAFA',
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
