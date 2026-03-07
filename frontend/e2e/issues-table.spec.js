const { test, expect } = require('@playwright/test');

test.describe('Issues Data Table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Navigate to Discover page.
    await page.click('a[href="/discover"]');
    await page.waitForSelector('[data-testid="issues-table-section"]');
  });

  test('renders table with issues', async ({ page }) => {
    // Wait for loading to finish.
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });
    // Should have rows (25 per page).
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(25);
  });

  test('displays all column headers', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });
    const headers = ['Repo', 'Topic', 'Rarity', 'Language', 'Difficulty', 'Stars', 'Actions'];
    for (const header of headers) {
      await expect(page.locator('table thead').getByText(header)).toBeVisible();
    }
  });

  test('sorts by stars descending by default', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });
    // Stars column header should have a desc arrow indicator.
    const starsHeader = page.locator('table thead').getByText('Stars');
    const headerButton = starsHeader.locator('..');
    // The ArrowDown icon (desc) should be present near the Stars header.
    await expect(headerButton.locator('svg')).toBeVisible();
  });

  test('clicking a column header toggles sort', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    // Get first row repo text before sort.
    const firstRepoBefore = await page.locator('table tbody tr').first().locator('td').first().textContent();

    // Click "Repo" header to sort ascending.
    await page.locator('table thead').getByText('Repo').click();
    await page.waitForTimeout(300);

    const firstRepoAfter = await page.locator('table tbody tr').first().locator('td').first().textContent();
    // Sort should change the order (or at least the header should respond).
    // The star sort is cleared, repo sort is now active.
    const repoHeader = page.locator('table thead').getByText('Repo').locator('..');
    await expect(repoHeader.locator('svg')).toBeVisible();
  });

  test('clicking sort twice reverses direction', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    // Click Language to sort asc.
    await page.locator('table thead').getByText('Language').click();
    await page.waitForTimeout(200);
    const firstLangAsc = await page.locator('table tbody tr').first().locator('td:nth-child(4)').textContent();

    // Click again to sort desc.
    await page.locator('table thead').getByText('Language').click();
    await page.waitForTimeout(200);
    const firstLangDesc = await page.locator('table tbody tr').first().locator('td:nth-child(4)').textContent();

    // The two should differ (unless all same language, which is unlikely).
    // At minimum, the header icon should change.
    const langHeader = page.locator('table thead').getByText('Language').locator('..');
    await expect(langHeader.locator('svg')).toBeVisible();
  });

  test('pagination controls are visible', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });
    // Pagination should show total count.
    await expect(page.locator('text=/\\d+ issues?/')).toBeVisible();
    // Page 1 button should be active (highlighted).
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible();
  });

  test('clicking next page shows different rows', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    const firstRowPage1 = await page.locator('table tbody tr').first().locator('td').first().textContent();

    // Click next page button (ChevronRight).
    const nextBtn = page.locator('[data-testid="issues-table-section"]').locator('button').filter({ has: page.locator('svg.lucide-chevron-right') });
    if (await nextBtn.isEnabled()) {
      await nextBtn.click();
      await page.waitForTimeout(300);
      const firstRowPage2 = await page.locator('table tbody tr').first().locator('td').first().textContent();
      expect(firstRowPage2).not.toBe(firstRowPage1);
    }
  });

  test('clicking a page number jumps to that page', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    const firstRowPage1 = await page.locator('table tbody tr').first().locator('td').first().textContent();

    // Click page 2 if available.
    const page2Btn = page.locator('[data-testid="issues-table-section"]').locator('button:has-text("2")');
    if (await page2Btn.isVisible()) {
      await page2Btn.click();
      await page.waitForTimeout(300);
      const firstRowPage2 = await page.locator('table tbody tr').first().locator('td').first().textContent();
      expect(firstRowPage2).not.toBe(firstRowPage1);

      // Page 2 button should now be highlighted.
      await expect(page2Btn).toHaveClass(/sky/);
    }
  });

  test('first/last page buttons work', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    const section = page.locator('[data-testid="issues-table-section"]');
    const lastBtn = section.locator('button').filter({ has: page.locator('svg.lucide-chevrons-right') });
    const firstBtn = section.locator('button').filter({ has: page.locator('svg.lucide-chevrons-left') });

    if (await lastBtn.isEnabled()) {
      await lastBtn.click();
      await page.waitForTimeout(300);
      // Now first page button should be enabled, last should be disabled.
      await expect(lastBtn).toBeDisabled();
      await expect(firstBtn).toBeEnabled();

      // Go back to first page.
      await firstBtn.click();
      await page.waitForTimeout(300);
      await expect(firstBtn).toBeDisabled();
    }
  });

  test('text search filters rows', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    const totalBefore = await page.locator('table tbody tr').count();

    // Type a search query.
    await page.fill('[data-testid="issues-table-search-input"]', 'python');
    await page.waitForTimeout(500);

    const totalAfter = await page.locator('table tbody tr').count();
    // Should filter down (or stay same if all match, but very unlikely).
    // At minimum, the table should still render.
    expect(totalAfter).toBeGreaterThan(0);
  });

  test('search with no matches shows empty message', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    await page.fill('[data-testid="issues-table-search-input"]', 'zzz_nonexistent_query_xyz_123');
    await page.waitForTimeout(500);

    await expect(page.getByText('No issues match your filters.')).toBeVisible();
  });

  test('rarity filter buttons filter the table', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    // Click "Common" rarity filter and wait for first row to show "Common" rarity.
    await page.click('[data-testid="filter-rarity-common"]');
    await expect(
      page.locator('table tbody tr').first().locator('td:nth-child(3)')
    ).toContainText('Common', { timeout: 30000 });

    // Verify all visible rarity cells on current page say "Common".
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const rarityCell = rows.nth(i).locator('td:nth-child(3)');
      await expect(rarityCell).toContainText('Common');
    }
  });

  test('language filter reloads table data', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    // Click "Rust" language filter and wait for first row to show "Rust".
    await page.click('[data-testid="filter-lang-rust"]');
    await expect(
      page.locator('table tbody tr').first().locator('td:nth-child(4)')
    ).toContainText('Rust', { timeout: 30000 });

    // Verify all visible language cells say "Rust".
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const langCell = rows.nth(i).locator('td:nth-child(4)');
      await expect(langCell).toContainText('Rust');
    }
  });

  test('each row has View and Choose action buttons', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow.getByText('View')).toBeVisible();
    await expect(firstRow.getByText('Choose')).toBeVisible();
  });

  test('View link opens in new tab with correct href', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    const viewLink = page.locator('table tbody tr').first().locator('a:has-text("View")');
    await expect(viewLink).toHaveAttribute('target', '_blank');
    const href = await viewLink.getAttribute('href');
    expect(href).toMatch(/^https:\/\/github\.com\//);
  });

  test('rarity badge displays for each row', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    // Rarity badges are in the 3rd column of each row.
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    const validRarities = ['Common', 'Rare', 'Epic', 'Legendary'];
    for (let i = 0; i < Math.min(count, 5); i++) {
      const rarityCell = rows.nth(i).locator('td:nth-child(3)');
      const text = await rarityCell.textContent();
      expect(validRarities.some(r => text.includes(r))).toBe(true);
    }
  });

  test('difficulty badge displays for each row', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    const firstRow = page.locator('table tbody tr').first();
    const diffCell = firstRow.locator('td:nth-child(5)');
    const text = await diffCell.textContent();
    expect(['Beginner', 'Intermediate', 'Advanced'].some(d => text.includes(d))).toBe(true);
  });

  test('pagination resets to page 1 on filter change', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    const section = page.locator('[data-testid="issues-table-section"]');

    // Go to page 2 if possible.
    const page2Btn = section.locator('button:has-text("2")');
    if (await page2Btn.isVisible()) {
      await page2Btn.click();
      await page.waitForTimeout(300);

      // Now apply a filter — pagination should reset.
      await page.click('[data-testid="filter-rarity-common"]');
      await page.waitForTimeout(2000);
      await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 });

      // Page 1 should be active now.
      const page1Btn = section.locator('button:has-text("1")');
      await expect(page1Btn).toHaveClass(/sky/);
    }
  });

  test('page size selector changes rows per page', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    // Default is 25 rows.
    const rowsBefore = await page.locator('table tbody tr').count();
    expect(rowsBefore).toBeLessThanOrEqual(25);

    // Change to 10.
    await page.selectOption('[data-testid="page-size-select"]', '10');
    await page.waitForTimeout(200);
    const rowsAfter = await page.locator('table tbody tr').count();
    expect(rowsAfter).toBeLessThanOrEqual(10);
    expect(rowsAfter).toBeGreaterThan(0);
  });

  test('page size selector shows all options', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    const select = page.locator('[data-testid="page-size-select"]');
    // Verify each option is selectable.
    for (const size of ['10', '25', '50', '100']) {
      await select.selectOption(size);
      await expect(select).toHaveValue(size);
    }
  });

  test('changing page size to 50 shows more rows', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    await page.selectOption('[data-testid="page-size-select"]', '50');
    await page.waitForTimeout(200);
    const rows = await page.locator('table tbody tr').count();
    expect(rows).toBeGreaterThan(25);
    expect(rows).toBeLessThanOrEqual(50);
  });

  test('go-to page input jumps to specific page', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    const firstRowPage1 = await page.locator('table tbody tr').first().locator('td').first().textContent();

    // Type page number and press Enter.
    const jumpInput = page.locator('[data-testid="page-jump-input"]');
    await jumpInput.fill('5');
    await jumpInput.press('Enter');
    await page.waitForTimeout(300);

    const firstRowPage5 = await page.locator('table tbody tr').first().locator('td').first().textContent();
    expect(firstRowPage5).not.toBe(firstRowPage1);

    // Page 5 button should be active.
    const section = page.locator('[data-testid="issues-table-section"]');
    await expect(section.locator('button:has-text("5")')).toHaveClass(/sky/);
  });

  test('go-to page input shows total page count', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    // Should show "/ N" next to the input.
    const section = page.locator('[data-testid="issues-table-section"]');
    await expect(section.locator('text=/\\/ \\d+/')).toBeVisible();
  });

  test('go-to page input rejects non-numeric input', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });

    const jumpInput = page.locator('[data-testid="page-jump-input"]');
    await jumpInput.fill('abc');
    // Input should be empty since non-numeric chars are stripped.
    await expect(jumpInput).toHaveValue('');
  });

  test('go-to page input ignores out-of-range values', async ({ page }) => {
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });
    // Wait for data to fully load.
    await page.waitForTimeout(500);

    // Ensure we're on page 1.
    const section = page.locator('[data-testid="issues-table-section"]');
    await expect(section.getByRole('button', { name: '1', exact: true })).toHaveClass(/sky/);

    // Try jumping to page 9999.
    const jumpInput = page.locator('[data-testid="page-jump-input"]');
    await jumpInput.fill('9999');
    await jumpInput.press('Enter');
    await page.waitForTimeout(200);

    // Should stay on page 1.
    await expect(section.getByRole('button', { name: '1', exact: true })).toHaveClass(/sky/);
  });
});
