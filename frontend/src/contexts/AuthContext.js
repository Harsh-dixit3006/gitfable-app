import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const inFlightMeRequestRef = useRef(false);

  // Listen to Supabase auth + token refresh
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setAuthUser(session.user);

        // Set token once from auth event to avoid concurrent session-lock reads.
        api.defaults.headers.common.Authorization = `Bearer ${session.access_token}`;

        if (inFlightMeRequestRef.current) {
          return;
        }
        inFlightMeRequestRef.current = true;

        // Try to get user profile from backend
        try {
          const res = await api.get('/auth/me');
          setUser(res._data);
        } catch (err) {
          if (err.response?.status === 404 || err.response?.status === 401) {
            // User authenticated with Supabase but not registered in our DB
            setIsRegistering(true);
            setShowLogin(true);
          } else {
            console.error('Auth error:', err);
            setUser(null);
          }
        }
        finally {
          inFlightMeRequestRef.current = false;
        }
      } else {
        setAuthUser(null);
        setUser(null);
        delete api.defaults.headers.common.Authorization;
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sign in with GitHub
  const signInWithGithub = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'github' });
      if (error) {
        throw error;
      }

      // Try to get existing user profile
      let needsRegistration = false;
      try {
        const res = await api.get('/auth/me');
        setUser(res._data);
        setShowLogin(false);
      } catch (err) {
        if (err.response?.status === 404 || err.response?.status === 401) {
          // New user - need to register
          needsRegistration = true;
          setIsRegistering(true);
        } else {
          throw err;
        }
      }
      return { success: true, needsRegistration };
    } catch (err) {
      console.error('GitHub sign in error:', err);

      const errorCode = err?.code || err?.error_code;
      const errorMessage = err?.message?.toLowerCase?.() || '';
      const isCancelled =
        errorCode === 'oauth_provider_cancelled' ||
        errorCode === 'access_denied' ||
        errorMessage.includes('cancel') ||
        errorMessage.includes('closed') ||
        errorMessage.includes('denied');

      return {
        success: false,
        error: isCancelled ? 'Sign in cancelled' : (err?.message || 'GitHub sign in failed')
      };
    }
  };

  // Register new user after Supabase auth
  const registerUser = async (username) => {
    if (!authUser) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const res = await api.post('/auth/register', {
        username: username,
      });

      setUser(res._data);
      setIsRegistering(false);
      setShowLogin(false);
      return { success: true, user: res._data };
    } catch (err) {
      return {
        success: false,
        error: err._message || 'Registration failed'
      };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAuthUser(null);
  };

  const refreshUser = async () => {
    if (!authUser) return;
    try {
      const res = await api.get('/auth/me');
      setUser(res._data);
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signInWithGithub,
      registerUser,
      logout,
      showLogin,
      setShowLogin,
      refreshUser,
      setUser,
      isRegistering,
      authUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
