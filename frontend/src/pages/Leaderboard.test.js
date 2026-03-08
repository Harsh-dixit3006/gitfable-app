import fs from 'fs';
import path from 'path';

describe('Leaderboard source regression checks', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/pages/Leaderboard.js'), 'utf8');

  test('uses all-time leaderboard request without unsupported period param', () => {
    expect(source).toContain("api.get('/leaderboard', { params: { limit: 50 } })");
    expect(source).not.toContain('period, limit: 50');
    expect(source).not.toContain("['weekly', 'monthly', 'all-time']");
  });

  test('does not hide leaderboard entries when fewer than three users exist', () => {
    expect(source).not.toContain('const rest = users.slice(3);');
    expect(source).not.toContain('{rest.map((u) => (');
  });
});
