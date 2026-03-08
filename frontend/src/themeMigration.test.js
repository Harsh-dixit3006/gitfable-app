import fs from 'fs';
import path from 'path';

const ROOT = path.join(process.cwd(), 'src');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('theme migration hotspots', () => {
  test('DrawAnimation removes legacy sky accent usage', () => {
    const source = readSource('components/DrawAnimation.js');

    expect(source).not.toMatch(/sky-[0-9]/);
    expect(source).not.toContain('rgba(125,211,252');
  });

  test('Landing removes leftover shared accent literals', () => {
    const source = readSource('pages/Landing.js');

    expect(source).not.toMatch(/amber-[0-9]/);
    expect(source).not.toContain('rgba(251,191,36');
    expect(source).not.toContain('rgba(245,158,11');
  });

  test('shared components avoid remaining ad hoc accent tokens', () => {
    const files = [
      'components/InfoSidebar.js',
      'components/IssueCardRow.js',
      'components/Navbar.js',
      'pages/Leaderboard.js',
    ];

    const combined = files.map(readSource).join('\n');

    expect(combined).not.toMatch(/sky-[0-9]/);
    expect(combined).not.toContain('rgba(125,211,252');
    expect(combined).not.toContain('focus:ring-amber-300/20');
  });

  test('data table ui uses shared accent styling instead of legacy sky tokens', () => {
    const source = readSource('components/ui/data-table.jsx');

    expect(source).not.toMatch(/sky-[0-9]/);
    expect(source).not.toContain('focus:border-sky-300/40');
  });
});
