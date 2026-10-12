import { expect, test } from '@playwright/test';

// DEMO credentials of the in-app mock API (see src/app/core/mock-api/mock-users.ts).
const OWNER = { email: 'owner@demo.test', password: 'Owner-Demo-123!' };

test('layout flips with the language: sidebar at the right in Arabic, at the left in English', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill(OWNER.password);
  await page.getByRole('button', { name: 'دخول' }).click();

  await expect(page).toHaveURL(/\/app$/);
  const html = page.locator('html');
  const sidebar = page.locator('app-sidebar nav');
  const content = page.locator('#main-content');
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('وضع تجريبي: بيانات وهمية')).toBeVisible();
  await expect(sidebar).toBeVisible();

  const side = async () => {
    const [s, c] = await Promise.all([sidebar.boundingBox(), content.boundingBox()]);
    return { sidebarRightOfContent: s!.x > c!.x, sidebarAtEdge: s!.x };
  };
  const viewportWidth = page.viewportSize()!.width;
  const arabic = await side();
  expect(arabic.sidebarRightOfContent).toBe(true);
  expect(arabic.sidebarAtEdge + (await sidebar.boundingBox())!.width).toBeCloseTo(viewportWidth, 0);
  await page.screenshot({ path: 'test-results/shell-ar.png' });

  await page.getByRole('button', { name: 'English' }).click();
  await expect(html).toHaveAttribute('dir', 'ltr');
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(page.getByText('DEMO MODE: mock data')).toBeVisible();
  const english = await side();
  expect(english.sidebarRightOfContent).toBe(false);
  expect(english.sidebarAtEdge).toBeCloseTo(0, 0);
  await page.screenshot({ path: 'test-results/shell-en.png' });
});
