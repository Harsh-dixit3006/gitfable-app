import fs from 'fs';
import path from 'path';
import { applyIssueFilters } from './discoverUtils';

const discoverSource = fs.readFileSync(path.join(process.cwd(), 'src/pages/Discover.js'), 'utf8');
const issueCardRowSource = fs.readFileSync(path.join(process.cwd(), 'src/components/IssueCardRow.js'), 'utf8');
const infoSidebarSource = fs.readFileSync(path.join(process.cwd(), 'src/components/InfoSidebar.js'), 'utf8');
const drawAnimationSource = fs.readFileSync(path.join(process.cwd(), 'src/components/DrawAnimation.js'), 'utf8');

describe('discover issue filtering', () => {
  const issues = [
    {
      repo: 'meteor/meteor',
      title: 'Fix mongo types',
      language: 'JavaScript',
      difficulty: 'Beginner',
      rarity: 'epic',
      stars: 44779,
      labels: ['good first issue'],
    },
    {
      repo: 'apache/airflow',
      title: 'Improve config tests',
      language: 'Python',
      difficulty: 'Beginner',
      rarity: 'epic',
      stars: 44551,
      labels: ['area:UI'],
    },
    {
      repo: 'stdlib-js/stdlib',
      title: 'Fix JavaScript lint errors',
      language: 'JavaScript',
      difficulty: 'Intermediate',
      rarity: 'rare',
      stars: 5800,
      labels: ['documentation'],
    },
  ];

  test('supports multi-select filters and text search together', () => {
    const result = applyIssueFilters(issues, {
      languages: ['JavaScript', 'Python'],
      difficulties: ['Beginner'],
      rarities: ['epic'],
      query: 'config',
      sortField: 'stars',
      sortDir: 'desc',
    });

    expect(result).toHaveLength(1);
    expect(result[0].repo).toBe('apache/airflow');
  });

  test('sorts filtered results by the requested field and direction', () => {
    const result = applyIssueFilters(issues, {
      languages: ['JavaScript'],
      difficulties: [],
      rarities: [],
      query: '',
      sortField: 'stars',
      sortDir: 'asc',
    });

    expect(result.map((issue) => issue.repo)).toEqual(['stdlib-js/stdlib', 'meteor/meteor']);
  });
});

describe('discover source regressions', () => {
  test('discover hero uses simplified draw copy and removes the top quest capsule', () => {
    expect(discoverSource).toContain('Draw an Issue');
    expect(discoverSource).not.toContain('Draw Your Destiny');
    expect(discoverSource).not.toContain('DISCOVER YOUR NEXT QUEST');
    expect(discoverSource).not.toContain('<GlitchText>Draw an Issue</GlitchText>');
  });

  test('page size select does not contain stray JSX text', () => {
    expect(discoverSource).not.toContain(')\n                         }');
  });

  test('issue cards keep edge and shadow hover without radial rarity glow overlay', () => {
    expect(issueCardRowSource).not.toContain('radial-gradient(600px circle');
  });

  test('issue row chrome avoids legendary-like amber styling for neutral controls', () => {
    expect(issueCardRowSource).not.toContain('accent.bgSubtle');
    expect(issueCardRowSource).not.toContain('accent.text');
    expect(issueCardRowSource).not.toContain('rune-btn px-4 py-2');
    expect(issueCardRowSource).toContain('bg-zinc-900/80 text-zinc-200 border border-white/[0.08]');
    expect(issueCardRowSource).toContain('bg-zinc-950/85 text-zinc-100');
  });

  test('discover secondary copy uses more readable sizes in sidebar and filter chrome', () => {
    expect(infoSidebarSource).not.toContain('text-[10px]');
    expect(infoSidebarSource).not.toContain('text-[11px]');
    expect(infoSidebarSource).toContain('text-sm font-mono uppercase');
    expect(discoverSource).toContain('text-base text-zinc-500');
  });

  test('discover syncs draw budget from actual history instead of a fixed default', () => {
    expect(discoverSource).toContain('const [redrawsRemaining, setRedrawsRemaining] = useState(null);');
    expect(discoverSource).toContain('const loadDrawBudget = async () =>');
    expect(discoverSource).toContain('const maxDraws = user?.daily_draw_limit || DEFAULT_DAILY_DRAW_LIMIT;');
    expect(discoverSource).toContain('setRedrawsRemaining(Math.max(0, maxDraws - usedToday));');
  });

  test('draw card uses larger dimensions to balance the sidebar', () => {
    expect(drawAnimationSource).toContain('w-96 h-[520px]');
  });

  test('draw reveal pacing is slowed down to build suspense', () => {
    expect(drawAnimationSource).toContain('drop: 1400');
    expect(drawAnimationSource).toContain('infoFlash: 2800');
    expect(drawAnimationSource).toContain('flip: 5200');
    expect(drawAnimationSource).toContain('settle: 6700');
  });

  test('browse flow supports choosing and bookmarking directly from the table path', () => {
    expect(discoverSource).toContain('bookmark_immediately: true');
    expect(issueCardRowSource).toContain('Choose & Bookmark');
  });

  test('discover renders active work queue instead of single active bookmark card', () => {
    expect(discoverSource).toContain('const [activeBookmarks, setActiveBookmarks] = useState([]);');
    expect(infoSidebarSource).toContain('Active Work');
    expect(infoSidebarSource).toContain('activeIndex');
    expect(infoSidebarSource).toContain('Viewing');
  });

  test('discover shows swap modal when bookmark queue is full', () => {
    expect(discoverSource).toContain('BOOKMARK_LIMIT_REACHED');
    expect(discoverSource).toContain('Replace this');
    expect(discoverSource).toContain('replace_draw_id');
  });

  test('discover keeps PR actions scoped to explicit draw ids from the active work list', () => {
    expect(discoverSource).toContain('const [pendingSwapIssue, setPendingSwapIssue] = useState(null);');
    expect(discoverSource).toContain('onSubmitPR={(drawId) => { setPrDrawId(drawId); setShowPRDialog(true); }}');
    expect(discoverSource).toContain('bookmark.id === prDrawId ? { ...bookmark, status: \'pr_submitted\', pr_url: prUrl } : bookmark');
    expect(discoverSource).toContain('filter((bookmark) => bookmark.id !== drawId)');
  });

  test('discover prevents choosing an issue already present in active work', () => {
    expect(discoverSource).toContain('const activeIssueIds = useMemo(() => new Set(');
    expect(issueCardRowSource).toContain("isAlreadyBookmarked ? 'Bookmarked' : 'Choose & Bookmark'");
  });

  test('swap modal uses aligned rows with a stable action column', () => {
    expect(discoverSource).toContain('grid-cols-[minmax(0,1fr)_auto]');
    expect(discoverSource).toContain('min-w-[140px]');
  });
});
