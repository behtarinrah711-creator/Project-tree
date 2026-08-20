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

async function bootSeededProject(page) {
  await page.addInitScript(state => {
    localStorage.clear();
    localStorage.setItem('gtasks-clone-v2', JSON.stringify(state));
  }, seededState);

  await page.goto('/#/project/e2e-project');
  await page.waitForFunction(() => Boolean(window.KarhaRealContractForm));
}

test('real contract form opens and renders required fields', async ({ page }) => {
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await bootSeededProject(page);

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

  expect(browserErrors).toEqual([]);
});

test('contract form can close back to contracts page without an uncaught error', async ({ page }) => {
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await bootSeededProject(page);

  await page.evaluate(() => window.KarhaRealContractForm.open(null, 'e2e-project'));
  await page.locator('#contractFormActions .if-cancel').click();

  await expect(page.locator('#contractFormPage')).toHaveClass(/hidden/);
  expect(browserErrors).toEqual([]);
});
