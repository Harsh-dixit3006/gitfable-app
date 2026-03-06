import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { signInWithPopup, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, githubProvider } from '@/lib/firebase';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
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
          const res = await axios.get(`${API}/auth/me`, { 
            headers: { Authorization: `Bearer ${idToken}` } 
          });
          setUser(res.data);
        } catch (err) {
          if (err.response?.status === 404) {
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
        const res = await axios.get(`${API}/auth/me`, { 
          headers: { Authorization: `Bearer ${idToken}` } 
        });
        setUser(res.data);
        setShowLogin(false);
      } catch (err) {
        if (err.response?.status === 404) {
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
      const res = await axios.post(`${API}/auth/register`, {
        firebase_uid: firebaseUser.uid,
        username: username,
        email: firebaseUser.email,
        display_name: firebaseUser.displayName || username,
        photo_url: firebaseUser.photoURL,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setUser(res.data.user);
      setIsRegistering(false);
      setShowLogin(false);
      return { success: true, user: res.data.user };
    } catch (err) {
      return { 
        success: false, 
        error: err.response?.data?.detail || 'Registration failed' 
      };
    }
  };

  // Legacy login (for backward compatibility during transition)
  const legacyLogin = async (username) => {
    // This is a mock login - in production, you'd remove this
    const res = await axios.post(`${API}/auth/login`, { username });
    localStorage.setItem('gitfable_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
    setShowLogin(false);
    return res.data;
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
      const res = await axios.get(`${API}/auth/me`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      setUser(res.data);
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
      legacyLogin,
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
