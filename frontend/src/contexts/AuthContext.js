import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { signInWithPopup, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, githubProvider } from '@/lib/firebase';
import { api } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const authHeaders = useCallback(() => {
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  }, [token]);

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        // Get Firebase ID token
        const idToken = await fbUser.getIdToken();
        setToken(idToken);

        // Try to get user profile from backend
        try {
          const res = await api.get('/auth/me', {
            headers: { Authorization: `Bearer ${idToken}` }
          });
          setUser(res._data);
        } catch (err) {
          if (err.response?.status === 404 || err.response?.status === 401) {
            // User authenticated with Firebase but not registered in our DB
            setIsRegistering(true);
            setShowLogin(true);
          } else {
            console.error('Auth error:', err);
            setToken(null);
            setUser(null);
          }
        }
      } else {
        setFirebaseUser(null);
        setToken(null);
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Sign in with GitHub
  const signInWithGithub = async () => {
    try {
      const result = await signInWithPopup(auth, githubProvider);
      const user = result.user;
      const idToken = await user.getIdToken();
      setToken(idToken);

      // Try to get existing user profile
      try {
        const res = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${idToken}` }
        });
        setUser(res._data);
        setShowLogin(false);
      } catch (err) {
        if (err.response?.status === 404 || err.response?.status === 401) {
          // New user - need to register
          setIsRegistering(true);
        } else {
          throw err;
        }
      }
      return { success: true };
    } catch (err) {
      console.error('GitHub sign in error:', err);
      return {
        success: false,
        error: err.code === 'auth/popup-closed-by-user'
          ? 'Sign in cancelled'
          : err.message
      };
    }
  };

  // Register new user after Firebase auth
  const registerUser = async (username) => {
    if (!firebaseUser || !token) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const res = await api.post('/auth/register', {
        username: username,
        token: token,
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
    await firebaseSignOut(auth);
    setToken(null);
    setUser(null);
    setFirebaseUser(null);
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const res = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(res._data);
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      signInWithGithub,
      registerUser,
      logout,
      showLogin,
      setShowLogin,
      authHeaders,
      refreshUser,
      setUser,
      isRegistering,
      firebaseUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
