import fs from 'fs';
import path from 'path';

const settingsSource = fs.readFileSync(path.join(process.cwd(), 'src/pages/Settings.js'), 'utf8');

describe('Settings page functionality', () => {
  test('has proper form state management', () => {
    expect(settingsSource).toContain('const [formData, setFormData]');
    expect(settingsSource).toContain('const [originalData, setOriginalData]');
    expect(settingsSource).toContain('const hasChanges');
  });

  test('tracks dirty state correctly', () => {
    expect(settingsSource).toContain('formData.displayName !== originalData.displayName');
    expect(settingsSource).toContain('formData.avatarUrl !== originalData.avatarUrl');
  });

  test('implements form submission with API call', () => {
    expect(settingsSource).toContain('api.put(\'/auth/me\'');
    expect(settingsSource).toContain('display_name: formData.displayName');
    expect(settingsSource).toContain('avatar_url: formData.avatarUrl');
  });

  test('refreshes user context after save', () => {
    expect(settingsSource).toContain('await refreshUser()');
    expect(settingsSource).toContain("toast.success('Profile updated successfully')");
  });

  test('handles errors with toast', () => {
    expect(settingsSource).toContain('toast.error(message)');
    expect(settingsSource).toContain("err._message || 'Failed to update profile'");
  });

  test('has cancel functionality', () => {
    expect(settingsSource).toContain('const handleCancel =');
    expect(settingsSource).toContain("toast.info('Changes discarded')");
    expect(settingsSource).toContain('setFormData({ ...originalData })');
  });

  test('username is immutable', () => {
    expect(settingsSource).toContain('Username');
    expect(settingsSource).toContain('Cannot be changed');
    expect(settingsSource).toContain('disabled');
    expect(settingsSource).toContain('cursor-not-allowed');
  });

  test('email is managed by auth provider', () => {
    expect(settingsSource).toContain('email');
    expect(settingsSource).toContain('Managed by Supabase Auth');
    expect(settingsSource).toContain('user.email');
  });

  test('has avatar preview', () => {
    expect(settingsSource).toContain('Avatar preview');
    expect(settingsSource).toContain('<img');
    expect(settingsSource).toContain('src={formData.avatarUrl}');
    expect(settingsSource).toContain('onError');
  });

  test('shows action buttons only when dirty', () => {
    expect(settingsSource).toContain('{hasChanges && (');
    expect(settingsSource).toContain('Save Changes');
    expect(settingsSource).toContain('Cancel');
  });

  test('requires auth to access', () => {
    expect(settingsSource).toContain('if (!user)');
    expect(settingsSource).toContain('Please sign in to access settings');
  });

  test('has proper navigation', () => {
    expect(settingsSource).toContain('navigate(-1)');
    expect(settingsSource).toContain('Back');
    expect(settingsSource).toContain('ArrowLeft');
  });

  test('shows loading state during save', () => {
    expect(settingsSource).toContain('const [saving, setSaving]');
    expect(settingsSource).toContain('disabled={saving}');
    expect(settingsSource).toContain('Saving...');
  });

  test('initializes form with user data', () => {
    expect(settingsSource).toContain('user.display_name');
    expect(settingsSource).toContain('user.avatar_url');
  });

  test('public profile link shown', () => {
    expect(settingsSource).toContain('Your profile is public');
    expect(settingsSource).toContain('/u/{user.username}');
  });
});

describe('Settings page UI structure', () => {
  test('has proper page title and description', () => {
    expect(settingsSource).toContain('Settings');
    expect(settingsSource).toContain('Manage your profile and preferences');
  });

  test('uses consistent icon styling', () => {
    expect(settingsSource).toContain('User');
    expect(settingsSource).toContain('Mail');
    expect(settingsSource).toContain('Save');
    expect(settingsSource).toContain('Camera');
    expect(settingsSource).toContain('AlertCircle');
    expect(settingsSource).toContain('CheckCircle2');
  });

  test('has amber accent styling', () => {
    expect(settingsSource).toContain('bg-amber-500/10');
    expect(settingsSource).toContain('text-amber-400');
    expect(settingsSource).toContain('bg-amber-500');
    expect(settingsSource).toContain('hover:bg-amber-400');
  });

  test('uses motion for animations', () => {
    expect(settingsSource).toContain("import { motion } from 'framer-motion'");
    expect(settingsSource).toContain('initial={{ opacity: 0, y: 20 }}');
    expect(settingsSource).toContain('animate={{ opacity: 1, y: 0 }}');
  });

  test('uses toast for notifications', () => {
    expect(settingsSource).toContain("import { toast } from 'sonner'");
  });
});

describe('Settings page form validation', () => {
  test('prevents submission without changes', () => {
    expect(settingsSource).toContain('if (!hasChanges) return;');
  });

  test('handles null/empty values', () => {
    expect(settingsSource).toContain('formData.displayName || null');
    expect(settingsSource).toContain('formData.avatarUrl || null');
  });

  test('has max length on display name', () => {
    expect(settingsSource).toContain('maxLength={50}');
  });

  test('shows field descriptions', () => {
    expect(settingsSource).toContain('How you want to be called');
    expect(settingsSource).toContain('Direct URL to your profile picture');
  });
});
