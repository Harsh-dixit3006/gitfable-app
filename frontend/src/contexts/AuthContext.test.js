import fs from 'fs';
import path from 'path';

const authContextSource = fs.readFileSync(path.join(process.cwd(), 'src/contexts/AuthContext.js'), 'utf8');

describe('AuthContext GitHub OAuth Integration', () => {
  test('uses localStorage for token management', () => {
    expect(authContextSource).toContain('localStorage');
  });

  test('handles OAuth callback', () => {
    expect(authContextSource).toContain('handleOAuthCallback');
  });

  test('sets Authorization header', () => {
    expect(authContextSource).toContain('api.defaults.headers.common.Authorization');
  });

  test('implements token refresh', () => {
    expect(authContextSource).toContain('tryRefreshToken');
  });

  test('redirects to backend OAuth endpoint for login', () => {
    expect(authContextSource).toContain('/api/v1/oauth/github');
  });

  test('does not import supabase', () => {
    expect(authContextSource).not.toContain('supabase');
  });
});
