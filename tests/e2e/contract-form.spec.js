import { test, expect } from '@playwright/test';

const project = {
  id: 'e2e-contract-project', name: 'پروژه تست قرارداد', location: 'تهران',
  tasks: [{ id: 'task-1', title: 'عملیات سازه', activities: ['activity-1'], children: [] }],
  contacts: [
    { id: 'employer-1', firstName: 'کارفرمای', lastName: 'آزمایشی', activities: [] },
    { id: 'contractor-1', firstName: 'پیمانکار', lastName: 'آزمایشی', activities: ['activity-1'] }
  ],
  activityTemplates: [{ id: 'activity-1', name: 'اجرای سازه' }],
  contractTemplates: [], contracts: [], statusForms: [], trashed: false, archived: false
};

const row = (page, label) => page.locator('#contractFormBody .ft-row').filter({ hasText: label }).first();

async function openRealContractForm(page, errors) {
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.addInitScript(seed => {
    localStorage.clear();
    localStorage.setItem('gtasks-clone-v2', JSON.stringify({
      schemaVersion: 4, projects: [seed], activeTab: seed.id, viewMode: 'simple', starredOrder: []
    }));
  }, project);
  await page.goto('/index.html#/projects/e2e-contract-project/contracts');
  await page.waitForFunction(() => Boolean(window.KarhaLegacy && window.KarhaApp));
  await expect(page.locator('#contractsPage')).toBeVisible();
  await page.locator('#contractAddBtn').click();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect(page.locator('#contractFormBody .form-template')).toBeVisible();
}

async function selectSearchOption(page, field, option) {
  await row(page, field).click();
  await expect(page.locator('#searchTemplatePage')).toBeVisible();
  await page.locator('.stpl-row').filter({ hasText: option }).first().click();
}

async function enterNumpad(page, field, digits) {
  await row(page, field).click();
  await expect(page.locator('#numpadOverlay')).toBeVisible();
  for (const digit of digits) await page.locator(`.numpad-key[data-d="${digit}"]`).click();
  await page.locator('#numpadDoneBtn').click();
  await expect(page.locator('#numpadOverlay')).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeVisible();
}

test('real New Contract preserves its state and owns child Back navigation', async ({ page }) => {
  const errors = [];
  await openRealContractForm(page, errors);

  for (const label of [
    'شماره قرارداد', 'تاریخ تنظیم قرارداد', 'محل انعقاد قرارداد', 'آیتم پروژه', 'کارفرما',
    'پیمانکار', 'تاریخ شروع قرارداد', 'تاریخ پایان قرارداد', 'مبلغ کل قرارداد',
    'درصد حسن انجام کار', 'مبنای شروع مدت نگهداری حسن انجام کار', 'مدت نگهداری حسن انجام کار'
  ]) await expect(row(page, label)).toBeVisible();

  const place = row(page, 'محل انعقاد قرارداد').locator('input');
  await place.fill('کارگاه مرکزی');
  await expect(place).toHaveValue('کارگاه مرکزی');

  // Picker search is its own first Back layer; the picker is the second.
  await row(page, 'کارفرما').click();
  await page.locator('#searchTemplateSearchBtn').click();
  await expect(page.locator('#searchTemplateInput')).toBeFocused();
  await page.goBack();
  await expect(page.locator('#searchTemplatePage')).toBeVisible();
  await expect(page.locator('#searchTemplateInput')).not.toBeFocused();
  await page.goBack();
  await expect(page.locator('#searchTemplatePage')).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect(place).toHaveValue('کارگاه مرکزی');

  await selectSearchOption(page, 'آیتم پروژه', 'عملیات سازه');
  // Project-item selection intentionally continues to the activity picker.
  await expect(page.locator('#searchTemplatePage')).toBeVisible();
  await page.locator('.stpl-row').filter({ hasText: 'اجرای سازه' }).click();
  await expect(row(page, 'آیتم پروژه')).toContainText('عملیات سازه');
  await selectSearchOption(page, 'کارفرما', 'کارفرمای آزمایشی');
  await expect(row(page, 'کارفرما')).toContainText('کارفرمای آزمایشی');
  await selectSearchOption(page, 'پیمانکار', 'پیمانکار آزمایشی');
  await expect(row(page, 'پیمانکار')).toContainText('پیمانکار آزمایشی');
  await selectSearchOption(page, 'مبنای شروع مدت نگهداری حسن انجام کار', 'تحویل موقت');
  await expect(row(page, 'مبنای شروع مدت نگهداری حسن انجام کار')).toContainText('تحویل موقت');
  await selectSearchOption(page, 'مدت نگهداری حسن انجام کار', 'دو ماه');
  await expect(row(page, 'مدت نگهداری حسن انجام کار')).toContainText('دو ماه');

  await enterNumpad(page, 'مبلغ کل قرارداد', '1250');
  await expect(row(page, 'مبلغ کل قرارداد')).toContainText(/1[,٬]?250|۱۲۵۰|۱[,٬]?۲۵۰/);
  await enterNumpad(page, 'درصد حسن انجام کار', '10');
  await expect(row(page, 'درصد حسن انجام کار')).toContainText(/10|۱۰/);

  await row(page, 'مبلغ کل قرارداد').click();
  await expect(page.locator('#numpadOverlay')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#numpadOverlay')).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeVisible();

  await row(page, 'تاریخ شروع قرارداد').click();
  await expect(page.locator('#jalaliPop')).toBeVisible();
  await page.locator('#jalaliBox .jalali-days button[data-d]:not([disabled])').first().click();
  await expect(page.locator('#jalaliPop')).toBeHidden();
  await expect(row(page, 'تاریخ شروع قرارداد')).not.toContainText('انتخاب تاریخ');
  await expect(page.locator('#contractFormPage')).toBeVisible();

  await row(page, 'تاریخ پایان قرارداد').click();
  await page.goBack();
  await expect(page.locator('#jalaliPop')).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeVisible();

  // With no child open, Back belongs to the dirty form and must ask about draft exit.
  await page.goBack();
  await expect(page.locator('.global-incomplete-exit-choice')).toBeVisible();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect(page.locator('#contractsPage')).toBeHidden();
  await expect(place).toHaveValue('کارگاه مرکزی');
  expect(errors).toEqual([]);
});
