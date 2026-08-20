import { test, expect } from '@playwright/test';

const seed = {
  schemaVersion: 8,
  viewMode: 'simple',
  activeTab: 'project-B',
  starredOrder: [],
  projects: [
    { id: 'project-A', name: 'پروژه الف', type: 'project', tasks: [], contacts: [], activityTemplates: [], contractTemplates: [], contracts: [], contractStatusReports: [], archived: false, trashed: false, completedOpen: false, schemaVersion: 8 },
    { id: 'project-B', name: 'پروژه ب', type: 'project', tasks: [], contacts: [], activityTemplates: [], contractTemplates: [], contracts: [], contractStatusReports: [], archived: false, trashed: false, completedOpen: false, schemaVersion: 8 }
  ]
};

async function openDrawerAndAssert(page) {
  await page.locator('#hamburgerBtn').click();
  await expect(page.locator('#drawerOverlay')).not.toHaveClass(/hidden/);
  const rows = page.locator('#drawerProjectList .drawer-project-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'پروژه الف' })).toBeVisible();
  await expect(rows.filter({ hasText: 'پروژه ب' })).toBeVisible();
  const selected = page.locator('#drawerProjectList .drawer-project-row.active');
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText('پروژه ب');
  await page.locator('#drawerOverlay').click({ position: { x: 5, y: 5 } });
}

test('selected project remains listed and highlighted across all four footer tabs', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(String(err)));

  await page.addInitScript(value => {
    localStorage.setItem('gtasks-clone-v2', JSON.stringify(value));
  }, seed);

  await page.goto('/');
  await page.waitForFunction(() => window.KarhaApp && window.KarhaLegacy, null, { timeout: 15_000 });

  for (const id of ['bottomProjectsBtn', 'bottomReportsBtn', 'bottomAccountingBtn', 'bottomSettingsBtn']) {
    await page.locator(`#${id}`).click();
    await openDrawerAndAssert(page);
  }

  expect(pageErrors.filter(message => !message.includes('Firebase'))).toEqual([]);
});
