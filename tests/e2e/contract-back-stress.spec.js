import { test, expect } from '@playwright/test';

const project = {
  id: 'e2e-contract-back-stress', name: 'پروژه تست بک تکراری', location: 'تهران',
  tasks: [], contacts: [], activityTemplates: [], contractTemplates: [], contracts: [], statusForms: [],
  trashed: false, archived: false
};

const row = (page, label) => page.locator('#contractFormBody .ft-row').filter({
  has: page.locator('.ft-label').filter({ hasText: new RegExp(`^${label}:?$`) })
}).first();

async function openDirtyContract(page){
  await page.addInitScript(seed => {
    localStorage.clear();
    localStorage.setItem('gtasks-clone-v2', JSON.stringify({
      schemaVersion: 4, projects: [seed], activeTab: seed.id, viewMode: 'simple', starredOrder: []
    }));
  }, project);

  await page.goto('/index.html#/projects/e2e-contract-back-stress/dashboard');
  await page.waitForFunction(() => Boolean(window.KarhaLegacy && window.KarhaApp && window.KarhaChildHistory));
  await page.locator('#hamburgerBtn').click();
  await page.locator('#drawerProjectList .drawer-project-row[data-project-id="e2e-contract-back-stress"]').click();
  await page.locator('#bottomReportsBtn').click();
  await page.getByText('قرارداد پیمانکاران', { exact: true }).first().click();
  await expect(page.locator('#contractsPage')).toBeVisible();
  await page.locator('#contractAddBtn').click();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await row(page, 'محل انعقاد قرارداد').locator('input').fill('کارگاه تست بک تکراری');
}

async function childKey(page){
  return page.evaluate(() => window.history.state?.child?.key || null);
}

test('dirty contract survives ten complete Back/prompt-dismiss cycles', async ({ page }) => {
  await openDirtyContract(page);
  const prompt = page.locator('.global-incomplete-exit-choice');

  for(let cycle = 0; cycle < 10; cycle++){
    await page.goBack();
    await expect(prompt, `prompt cycle ${cycle + 1}`).toBeVisible();
    await expect.poll(() => childKey(page)).toBe('transient:incomplete-exit-choice');
    await expect(page.locator('#contractFormPage')).toBeVisible();

    await page.goBack();
    await expect(prompt, `dismiss cycle ${cycle + 1}`).toBeHidden();
    await expect(page.locator('#contractFormPage')).toBeVisible();
    await expect.poll(() => childKey(page)).toBe('contract-form');
  }

  await expect(page).toHaveURL(/#\/projects\/e2e-contract-back-stress\//);
  await expect(row(page, 'محل انعقاد قرارداد').locator('input')).toHaveValue('کارگاه تست بک تکراری');
});

test('rapid repeated Back while dirty never escapes the application document', async ({ page }) => {
  await openDirtyContract(page);
  const prompt = page.locator('.global-incomplete-exit-choice');
  const appUrl = page.url();

  // Mimic repeated physical Back presses faster than the UI can visibly settle.
  await page.evaluate(() => {
    history.back();
    setTimeout(() => history.back(), 0);
    setTimeout(() => history.back(), 5);
    setTimeout(() => history.back(), 10);
  });

  await page.waitForTimeout(300);
  expect(new URL(page.url()).pathname).toBe(new URL(appUrl).pathname);
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect(row(page, 'محل انعقاد قرارداد').locator('input')).toHaveValue('کارگاه تست بک تکراری');

  // The settled state may be either the form or its transient prompt, but it
  // must still be an application-owned contract state and never a foreign entry.
  const state = await page.evaluate(() => window.history.state);
  expect(state?.app).toBe('karha');
  expect(['contract-form', 'transient:incomplete-exit-choice']).toContain(state?.child?.key);
  if(await prompt.isVisible()) await expect(prompt).toBeVisible();
});
