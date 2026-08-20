import { test, expect } from '@playwright/test';

const LIVE_URL = 'https://behtarinrah711-creator.github.io/Project-tree/';
const AUTH_URL = /(accounts\.google\.com|tree-d92af\.(?:web\.app|firebaseapp\.com)\/__\/auth)/i;

test('live GitHub Pages login reaches Google OAuth flow', async ({ page, context }) => {
  test.setTimeout(45_000);

  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await expect(page.locator('#avatarBtn')).toBeVisible();
  await page.locator('#avatarBtn').click();
  await expect(page.locator('#drawerSigninBtn')).toBeVisible();

  await page.locator('#drawerSigninBtn').click();

  let matchedUrl = '';
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && !matchedUrl) {
    for (const candidate of context.pages()) {
      const url = candidate.url();
      if (AUTH_URL.test(url)) {
        matchedUrl = url;
        break;
      }
    }
    if (!matchedUrl) await page.waitForTimeout(250);
  }

  expect(matchedUrl, 'Login never reached Firebase/Google OAuth on the deployed site').toMatch(AUTH_URL);

  const toast = page.locator('#toast');
  if (await toast.count()) {
    await expect(toast).not.toContainText('ارتباط با سرویس ورود برقرار نشد');
  }
});
