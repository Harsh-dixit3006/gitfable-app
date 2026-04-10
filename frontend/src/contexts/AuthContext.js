import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';

const AuthContext = createContext(null);

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authUser, setAuthUser] = useState(null); // GitHub info for registration form
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const registrationTokenRef = useRef(null);

  // On mount, check for existing tokens
  useEffect(() => {
    const accessToken = localStorage.getItem('access_token');
    if (accessToken) {
      api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
      api.get('/auth/me')
        .then((res) => {
          setUser(res._data);
        })
        .catch(async (err) => {
          if (err.response?.status === 401) {
            // Try refresh
            const refreshed = await tryRefreshToken();
            if (refreshed) {
              try {
                const res = await api.get('/auth/me');
                setUser(res._data);
              } catch {
                clearTokens();
              }
            } else {
              clearTokens();
            }
          } else {
            clearTokens();
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sign in with GitHub — redirect to backend OAuth endpoint
  const signInWithGithub = useCallback(() => {
    window.location.href = `${API_URL}/api/v1/oauth/github`;
  }, []);

  // Dev login — only available when OAuth is not configured
  const devLogin = useCallback(async () => {
    try {
      const res = await api.post('/auth/dev-login');
      const { user: devUser, access_token, refresh_token } = res._data;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      api.defaults.headers.common.Authorization = `Bearer ${access_token}`;
      setUser(devUser);
      setShowLogin(false);
      return { success: true };
    } catch (err) {
      return { success: false, error: err._message || 'Dev login failed' };
    }
  }, []);

  // Handle OAuth callback data (called from AuthCallback page)
  const handleOAuthCallback = useCallback((data) => {
    if (data.needsRegistration) {
      registrationTokenRef.current = data.registrationToken;
      setAuthUser({
        login: data.githubLogin,
        name: data.githubName,
        avatar_url: data.githubAvatar,
        email: data.email,
      });
      setIsRegistering(true);
      setShowLogin(true);
    } else {
      localStorage.setItem('access_token', data.accessToken);
      localStorage.setItem('refresh_token', data.refreshToken);
      api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;

      // Fetch user profile
      api.get('/auth/me')
        .then((res) => {
          setUser(res._data);
        })
        .catch(() => {
          clearTokens();
        });
    }
  }, []);

  // Register new user after OAuth
  const registerUser = async (username) => {
    const token = registrationTokenRef.current;
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const res = await api.post('/auth/register', {
        username,
        github_login: authUser?.login || '',
        display_name: authUser?.name || '',
        avatar_url: authUser?.avatar_url || '',
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const { user: newUser, access_token, refresh_token } = res._data;

      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      api.defaults.headers.common.Authorization = `Bearer ${access_token}`;

      setUser(newUser);
      setIsRegistering(false);
      setShowLogin(false);
      registrationTokenRef.current = null;
      setAuthUser(null);

      return { success: true, user: newUser };
    } catch (err) {
      return {
        success: false,
        error: err._message || 'Registration failed',
      };
    }
  };

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    setAuthUser(null);
    setIsRegistering(false);
    registrationTokenRef.current = null;
  }, []);

  const refreshUser = async () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return;
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
      devLogin,
      handleOAuthCallback,
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

// --- Token helpers ---

function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  delete api.defaults.headers.common.Authorization;
}

async function tryRefreshToken() {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return false;

  try {
    const res = await api.post('/oauth/refresh', { refresh_token: refreshToken });
    const { access_token, refresh_token: newRefresh } = res._data;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', newRefresh);
    api.defaults.headers.common.Authorization = `Bearer ${access_token}`;
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

// --- Axios 401 interceptor for automatic token refresh ---

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(undefined, async (error) => {
  const originalRequest = error.config;

  // Only intercept 401s, not on refresh or registration endpoints
  if (
    error.response?.status !== 401 ||
    originalRequest._retry ||
    originalRequest.url?.includes('/oauth/refresh') ||
    originalRequest.url?.includes('/auth/register')
  ) {
    return Promise.reject(error);
  }

  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    }).then((token) => {
      originalRequest.headers.Authorization = `Bearer ${token}`;
      return api(originalRequest);
    });
  }

  originalRequest._retry = true;
  isRefreshing = true;

  try {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const newToken = localStorage.getItem('access_token');
      processQueue(null, newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } else {
      processQueue(new Error('Refresh failed'));
      return Promise.reject(error);
    }
  } catch (refreshError) {
    processQueue(refreshError);
    return Promise.reject(refreshError);
  } finally {
    isRefreshing = false;
  }
});
