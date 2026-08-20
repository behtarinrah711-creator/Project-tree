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

async function bootContractHarness(page) {
  await page.addInitScript(state => {
    localStorage.clear();
    localStorage.setItem('gtasks-clone-v2', JSON.stringify(state));
  }, seededState);

  await page.goto('/#/project/e2e-project', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#contractFormPage')).toBeAttached();

  await page.evaluate(async () => {
    window.openRealContractFormShell = () => {
      document.getElementById('contractFormPage')?.classList.remove('hidden');
      return true;
    };
    window.closeRealContractFormShell = () => {
      document.getElementById('contractFormPage')?.classList.add('hidden');
      return true;
    };
    window.pushWorkspaceHistory = () => true;
    window.todayJalaliStr = () => '1405/05/29';
    window.getContacts = project => project?.contacts || [];
    window.findActivityTemplate = () => null;
    window.formatJalaliDisplay = value => String(value || '');
    window.toEnglishDigits = value => String(value ?? '');
    window.toPersianDigits = value => String(value ?? '');
    window.formatCost = value => String(value ?? '');
    window.escapeHtml = value => String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
    window.svgPlus = () => '+';
    window.svgGrip = () => '⋮⋮';
    window.showToast = () => {};
    window.openJalaliPicker = () => false;
    window.openNumpadGeneric = () => false;

    const module = await import('/src/modules/contracts/realContractFormModule.js');
    window.__e2eRealContractForm = module.realContractFormModule;
  });
}

test('real contract form opens and renders required fields', async ({ page }) => {
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await bootContractHarness(page);

  const opened = await page.evaluate(() => window.__e2eRealContractForm.open(null, 'e2e-project'));
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

test('contract form can close without an uncaught browser error', async ({ page }) => {
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await bootContractHarness(page);

  await page.evaluate(() => window.__e2eRealContractForm.open(null, 'e2e-project'));
  await page.locator('#contractFormActions .if-cancel').click();

  await expect(page.locator('#contractFormPage')).toHaveClass(/hidden/);
  expect(browserErrors).toEqual([]);
});
