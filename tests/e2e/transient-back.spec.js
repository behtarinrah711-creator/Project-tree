import { test, expect } from '@playwright/test';

const project = {
  id: 'e2e-transient-back-project', name: 'پروژه تست بک مودال', location: 'تهران',
  tasks: [], contacts: [], activityTemplates: [], contractTemplates: [], contracts: [], statusForms: [],
  trashed: false, archived: false
};

const row = (page, label) => page.locator('#contractFormBody .ft-row').filter({
  has: page.locator('.ft-label').filter({ hasText: new RegExp(`^${label}:?$`) })
}).first();

async function openDirtyContractForm(page){
  await page.addInitScript(seed => {
    localStorage.clear();
    localStorage.setItem('gtasks-clone-v2', JSON.stringify({
      schemaVersion: 4, projects: [seed], activeTab: seed.id, viewMode: 'simple', starredOrder: []
    }));
  }, project);

  await page.goto('/index.html#/projects/e2e-transient-back-project/dashboard');
  await page.waitForFunction(() => Boolean(window.KarhaLegacy && window.KarhaApp && window.KarhaChildHistory));

  await page.locator('#hamburgerBtn').click();
  const projectRow = page.locator('#drawerProjectList .drawer-project-row[data-project-id="e2e-transient-back-project"]');
  await expect(projectRow).toBeVisible();
  await projectRow.click();

  await page.locator('#bottomReportsBtn').click();
  await page.getByText('قرارداد پیمانکاران', { exact: true }).first().click();
  await expect(page.locator('#contractsPage')).toBeVisible();
  await page.locator('#contractAddBtn').click();
  await expect(page.locator('#contractFormPage')).toBeVisible();

  const place = row(page, 'محل انعقاد قرارداد').locator('input');
  await place.fill('کارگاه مرکزی');
  await expect(place).toHaveValue('کارگاه مرکزی');
  return place;
}

test('Back on dirty-form confirmation dismisses only the confirmation and preserves the form', async ({ page }) => {
  const place = await openDirtyContractForm(page);
  const prompt = page.locator('.global-incomplete-exit-choice');

  // First Back asks what to do with the dirty form.
  await page.goBack();
  await expect(prompt).toBeVisible();
  // A visible modal must already own the current browser entry. This closes the
  // race where the user could see the prompt before its same-route guard existed.
  await expect.poll(() => page.evaluate(() => window.history.state?.child?.key || null))
    .toBe('transient:incomplete-exit-choice');
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect(page.locator('#contractsPage')).toBeHidden();
  await expect(place).toHaveValue('کارگاه مرکزی');

  // Second Back belongs to the top-most transient confirmation only.
  await page.goBack();
  await expect(prompt).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect(page.locator('#contractsPage')).toBeHidden();
  await expect(place).toHaveValue('کارگاه مرکزی');
  await expect.poll(() => page.evaluate(() => window.history.state?.child?.key || null))
    .toBe('contract-form');

  // The form is still dirty, so another Back asks again instead of navigating away.
  await page.goBack();
  await expect(prompt).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.history.state?.child?.key || null))
    .toBe('transient:incomplete-exit-choice');
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect(place).toHaveValue('کارگاه مرکزی');

  // Choosing No settles the transient entry first, then really consumes the
  // restored form entry and returns to Contracts.
  await prompt.locator('[data-exit="no"]').click();
  await expect(prompt).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeHidden();
  await expect(page.locator('#contractsPage')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.history.state?.child?.key || null))
    .not.toBe('contract-form');
});

test('Yes saves a new-contract draft and New Contract restores it as the clean baseline', async ({ page }) => {
  await openDirtyContractForm(page);
  const prompt = page.locator('.global-incomplete-exit-choice');

  await page.goBack();
  await expect(prompt).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.history.state?.child?.key || null))
    .toBe('transient:incomplete-exit-choice');

  await prompt.locator('[data-exit="yes"]').click();
  await expect(prompt).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeHidden();
  await expect(page.locator('#contractsPage')).toBeVisible();

  const storedPlace = await page.evaluate(() => {
    const raw = localStorage.getItem('karha_real_contract_form_draft_v1');
    return raw ? JSON.parse(raw).contractPlace : null;
  });
  expect(storedPlace).toBe('کارگاه مرکزی');

  // Reopening New Contract must recover the saved draft; otherwise "Yes" has
  // no user-visible meaning even though bytes were written to localStorage.
  await page.locator('#contractAddBtn').click();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  const restoredPlace = row(page, 'محل انعقاد قرارداد').locator('input');
  await expect(restoredPlace).toHaveValue('کارگاه مرکزی');

  // A restored draft is a clean baseline, so immediate Back exits without
  // showing the save-draft question again.
  await page.goBack();
  await expect(prompt).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeHidden();
  await expect(page.locator('#contractsPage')).toBeVisible();
});
