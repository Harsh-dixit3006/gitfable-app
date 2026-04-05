import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleOAuthCallback } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    const refresh = searchParams.get('refresh');
    const needsRegistration = searchParams.get('needs_registration') === 'true';
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      toast.error(errorDescription || 'Authentication failed');
      navigate('/', { replace: true });
      return;
    }

    if (needsRegistration && token) {
      // New user — pass registration info to auth context
      handleOAuthCallback({
        needsRegistration: true,
        registrationToken: token,
        githubLogin: searchParams.get('github_login') || '',
        githubName: searchParams.get('github_name') || '',
        githubAvatar: searchParams.get('github_avatar') || '',
        email: '', // extracted from token by backend
      });
      navigate('/', { replace: true });
      return;
    }

    if (token && refresh) {
      // Existing user — store tokens and load profile
      handleOAuthCallback({
        needsRegistration: false,
        accessToken: token,
        refreshToken: refresh,
      });
      navigate('/discover', { replace: true });
      return;
    }

    // Unexpected state
    toast.error('Something went wrong with authentication');
    navigate('/', { replace: true });
  }, [searchParams, navigate, handleOAuthCallback]);

  return (
    <div className="min-h-screen flex items-center justify-center pt-16">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mx-auto" />
        <p className="text-sm text-zinc-500 font-mono">Completing sign in...</p>
      </div>
    </div>
  );
}
