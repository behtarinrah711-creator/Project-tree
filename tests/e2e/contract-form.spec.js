import { test, expect } from '@playwright/test';

const seededState = {
  projects: [
    {
      id: 'e2e-project',
      name: 'پروژه تست قرارداد',
      location: 'تهران',
      tasks: [],
      contacts: [],
      activityTemplates: [],
      contractTemplates: [],
      contracts: [],
      statusForms: [],
      trashed: false,
      archived: false
    }
  ]
};

test.beforeEach(async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.addInitScript(state => {
    localStorage.clear();
    localStorage.setItem('gtasks-clone-v2', JSON.stringify(state));
  }, seededState);

  await page.goto('/#/project/e2e-project');
  await page.waitForFunction(() => Boolean(window.KarhaRealContractForm));

  page.__pageErrors = pageErrors;
});

test('real contract form opens and renders required fields', async ({ page }) => {
  const opened = await page.evaluate(() => window.KarhaRealContractForm.open(null, 'e2e-project'));
  expect(opened).toBe(true);

  await expect(page.locator('#contractFormPage')).not.toHaveClass(/hidden/);
  await expect(page.locator('#contractFormBody .form-template')).toBeVisible();
  await expect(page.locator('#contractFormBody')).toContainText('شماره قرارداد');
  await expect(page.locator('#contractFormBody')).toContainText('آیتم پروژه');
  await expect(page.locator('#contractFormBody')).toContainText('کارفرما');
  await expect(page.locator('#contractFormBody')).toContainText('پیمانکار');
  await expect(page.locator('#contractFormBody')).toContainText('مبلغ کل قرارداد');
  await expect(page.locator('#contractFormActions .if-save')).toBeVisible();

  const errors = await page.evaluate(() => window.__contractFormE2EErrors || []);
  expect(errors).toEqual([]);
});

test('opening the form does not throw an uncaught browser error', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.evaluate(() => window.KarhaRealContractForm.open(null, 'e2e-project'));
  await page.waitForTimeout(250);

  expect(errors).toEqual([]);
});
