import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  User,
  Mail,
  Save,
  ArrowLeft,
  Camera,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    avatarUrl: '',
  });
  const [originalData, setOriginalData] = useState({
    displayName: '',
    avatarUrl: '',
  });

  useEffect(() => {
    if (user) {
      const initialData = {
        displayName: user.display_name || '',
        avatarUrl: user.avatar_url || '',
      };
      setFormData(initialData);
      setOriginalData(initialData);
    }
  }, [user]);

  const hasChanges = 
    formData.displayName !== originalData.displayName ||
    formData.avatarUrl !== originalData.avatarUrl;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hasChanges) return;

    setSaving(true);
    try {
      const res = await api.put('/auth/me', {
        display_name: formData.displayName || null,
        avatar_url: formData.avatarUrl || null,
      });

      // Update original data to match saved data
      setOriginalData({ ...formData });
      
      // Refresh user context to reflect changes
      await refreshUser();
      
      toast.success('Profile updated successfully');
    } catch (err) {
      const message = err._message || 'Failed to update profile';
      toast.error(message);
      console.error('Settings update error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({ ...originalData });
    toast.info('Changes discarded');
  };

  if (!user) {
    return (
      <div className="min-h-screen pt-24 px-6 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-500">Please sign in to access settings</p>
          <Button 
            onClick={() => navigate('/')} 
            className="mt-4"
          >
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-24 px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <h1 className="text-3xl font-bold text-zinc-100 mb-2">
            Settings
          </h1>
          <p className="text-zinc-500">
            Manage your profile and preferences
          </p>
        </motion.div>

        {/* Profile Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-6"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 rounded-xl bg-amber-500/10">
              <User className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Profile Information</h2>
              <p className="text-sm text-zinc-500">Update your public profile details</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username (Read-only) */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                Username
                <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">
                  Cannot be changed
                </span>
              </label>
              <Input
                value={user.username}
                disabled
                className="bg-zinc-800/50 border-zinc-700 text-zinc-500 cursor-not-allowed"
              />
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">
                Display Name
              </label>
              <Input
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                placeholder="How you want to be called"
                maxLength={50}
                className="bg-zinc-800/50 border-zinc-700 text-zinc-100 focus:border-amber-500/50"
              />
              <p className="text-xs text-zinc-600">
                This will be shown instead of your username across the app
              </p>
            </div>

            {/* Avatar URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Avatar URL
              </label>
              <Input
                value={formData.avatarUrl}
                onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                placeholder="https://example.com/avatar.jpg"
                className="bg-zinc-800/50 border-zinc-700 text-zinc-100 focus:border-amber-500/50"
              />
              <p className="text-xs text-zinc-600">
                Direct URL to your profile picture (JPG, PNG, or GIF)
              </p>
              
              {formData.avatarUrl && (
                <div className="mt-3 p-3 bg-zinc-800/30 rounded-lg">
                  <p className="text-xs text-zinc-500 mb-2">Preview:</p>
                  <img
                    src={formData.avatarUrl}
                    alt="Avatar preview"
                    className="w-16 h-16 rounded-full object-cover border-2 border-zinc-700"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                  <div className="w-16 h-16 rounded-full bg-zinc-800 hidden items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                  </div>
                </div>
              )}
            </div>

            {/* Email (Read-only from Firebase) */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
                <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">
                  Managed by Firebase
                </span>
              </label>
              <Input
                value={user.email || ''}
                disabled
                className="bg-zinc-800/50 border-zinc-700 text-zinc-500 cursor-not-allowed"
              />
            </div>

            {/* Action Buttons */}
            {hasChanges && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 pt-4 border-t border-zinc-800"
              >
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold"
                >
                  {saving ? (
                    <>
                      <span className="animate-spin mr-2">⚪</span>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={saving}
                  className="border-zinc-700 hover:bg-zinc-800"
                >
                  Cancel
                </Button>
              </motion.div>
            )}
          </form>
        </motion.div>

        {/* Info Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-1">
                Your profile is public
              </h3>
              <p className="text-sm text-zinc-500">
                Changes you make here will be visible on your public profile at{' '}
                <span className="text-amber-400">
                  /u/{user.username}
                </span>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
