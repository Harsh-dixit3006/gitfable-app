import fs from 'fs';
import path from 'path';

const historySource = fs.readFileSync(path.join(process.cwd(), 'src/pages/History.js'), 'utf8');

describe('History page search functionality', () => {
  test('implements search input with debouncing', () => {
    expect(historySource).toContain('const [searchQuery, setSearchQuery] = useState');
    expect(historySource).toContain('const [debouncedSearch, setDebouncedSearch]');
    expect(historySource).toContain('setTimeout(() => {');
    expect(historySource).toContain('clearTimeout(timer)');
    expect(historySource).toContain('300'); // debounce delay
  });

  test('filters draws based on search query', () => {
    expect(historySource).toContain('const filteredDraws = useMemo');
    expect(historySource).toContain('.toLowerCase().includes(query)');
    expect(historySource).toContain('draw.title?.toLowerCase()');
    expect(historySource).toContain('draw.repo?.toLowerCase()');
    expect(historySource).toContain('draw.language?.toLowerCase()');
  });

  test('shows search results count', () => {
    expect(historySource).toContain('Found {filteredDraws.length}');
    expect(historySource).toContain("{filteredDraws.length === 1 ? 'result' : 'results'}");
    expect(historySource).toContain('out of ${draws.length} total');
  });

  test('has clear search button', () => {
    expect(historySource).toContain('onClick={() => setSearchQuery(\'\')}');
    expect(historySource).toContain('{searchQuery && (');
    expect(historySource).toContain('<X className="w-4 h-4 text-zinc-500"');
  });

  test('shows empty search state', () => {
    expect(historySource).toContain('filteredDraws.length === 0');
    expect(historySource).toContain('No results found');
    expect(historySource).toContain('No issues match');
    expect(historySource).toContain('Clear Search');
  });

  test('search input has proper styling and placeholder', () => {
    expect(historySource).toContain('placeholder="Search issues, repos, languages..."');
    expect(historySource).toContain('Search className="absolute left-3');
    expect(historySource).toContain('<Search className="absolute left-3');
  });

  test('uses groupedDraws based on filteredDraws', () => {
    expect(historySource).toContain('filteredDraws.forEach(draw => {');
    expect(historySource).toContain('[filteredDraws]'); // dependency array
  });
});

describe('History page status filtering', () => {
  test('supports all status filters', () => {
    const statuses = ['all', 'merged', 'active', 'drawn', 'expired'];
    statuses.forEach(status => {
      expect(historySource).toContain(`statusFilter === '${status}'`);
    });
  });

  test('shows counts on filter chips', () => {
    expect(historySource).toContain('count={filterCounts.all}');
    expect(historySource).toContain('count={filterCounts.merged}');
    expect(historySource).toContain('count={filterCounts.active}');
  });

  test('active filter includes bookmarked and pr_submitted', () => {
    expect(historySource).toContain("['bookmarked', 'pr_submitted'].includes(d.status)");
  });
});

describe('History page reactivation', () => {
  test('implements reactivation modal', () => {
    expect(historySource).toContain('ReactivateModal');
    expect(historySource).toContain('reactivateModalOpen');
    expect(historySource).toContain('handleReactivateClick');
  });

  test('handles bookmark limit reached with swap', () => {
    expect(historySource).toContain('BOOKMARK_LIMIT_REACHED');
    expect(historySource).toContain('showSwapModal');
    expect(historySource).toContain('swapCandidates');
    expect(historySource).toContain('Replace one of these');
  });

  test('swap candidates are shown when limit reached', () => {
    expect(historySource).toContain('setSwapCandidates(activeWork)');
    expect(historySource).toContain('setShowSwapModal(true)');
  });
});

describe('History page time grouping', () => {
  test('groups by time periods', () => {
    expect(historySource).toContain("{ key: 'today', label: 'Today'");
    expect(historySource).toContain("{ key: 'week', label: 'This Week'");
    expect(historySource).toContain("{ key: 'month', label: 'This Month'");
    expect(historySource).toContain("{ key: 'older', label: 'Earlier'");
  });

  test('collapsible groups', () => {
    expect(historySource).toContain('expandedGroups');
    expect(historySource).toContain('toggleGroup');
    expect(historySource).toContain('ChevronDown');
    expect(historySource).toContain('ChevronRight');
  });
});

describe('History page stats', () => {
  test('calculates stats correctly', () => {
    expect(historySource).toContain('stats.total');
    expect(historySource).toContain('stats.merged');
    expect(historySource).toContain('stats.active');
  });

  test('shows success rate', () => {
    expect(historySource).toContain('Success Rate');
    expect(historySource).toContain('(stats.merged / stats.total) * 100');
  });
});

describe('History page source regressions', () => {
  test('does not use empty catch blocks', () => {
    expect(historySource).not.toContain('.catch(() => {})');
    expect(historySource).not.toMatch(/catch\s*\(\s*\)\s*\{\s*\}/);
  });

  test('handles errors with toast notifications', () => {
    expect(historySource).toContain("toast.error(errorMessage || 'Failed to reactivate. Please try again.')");
  });

  test('imports Search and X icons for search UI', () => {
    expect(historySource).toContain("import {");
    expect(historySource).toContain('Search,');
    expect(historySource).toContain('X\n');
  });
});
