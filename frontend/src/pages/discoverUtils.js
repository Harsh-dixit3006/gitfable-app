export function applyIssueFilters(issues, {
  languages = [],
  difficulties = [],
  rarities = [],
  query = '',
  sortField = 'stars',
  sortDir = 'desc',
} = {}) {
  let filtered = issues.filter((issue) => {
    const byLang = languages.length === 0 || languages.includes(issue.language);
    const byDiff = difficulties.length === 0 || difficulties.includes(issue.difficulty);
    const byRarity = rarities.length === 0 || rarities.includes(issue.rarity);
    return byLang && byDiff && byRarity;
  });

  if (query) {
    const term = query.toLowerCase();
    filtered = filtered.filter((issue) =>
      `${issue.repo} ${issue.title} ${(issue.labels || []).join(' ')}`.toLowerCase().includes(term)
    );
  }

  return [...filtered].sort((a, b) => {
    const aVal = a[sortField] ?? 0;
    const bVal = b[sortField] ?? 0;

    if (typeof aVal === 'string' || typeof bVal === 'string') {
      const aText = String(aVal);
      const bText = String(bVal);
      return sortDir === 'asc' ? aText.localeCompare(bText) : bText.localeCompare(aText);
    }

    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });
}
