import { expect, test } from '@playwright/test';

test('registers an office, then signs in with the new owner account', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: /Create an office account|أنشئ حساب مكتب/ }).click();
  await expect(page).toHaveURL(/\/register$/);

  await page.locator('#officeName').fill('DEMO E2E Office');
  await page.locator('#name').fill('DEMO E2E Owner');
  await page.locator('#email').fill('e2e-owner@demo.test');
  await page.locator('#password').fill('Correct-Horse-123');
  await page.locator('#passwordConfirmation').fill('Correct-Horse-123');
  await page.locator('form button[type="submit"]').click();

  await expect(page.locator('#register-success')).toBeVisible();
  await page.getByRole('link', { name: /Sign in|دخول/ }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.locator('#email').fill('e2e-owner@demo.test');
  await page.locator('#password').fill('Correct-Horse-123');
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/app/);
});

test('register page mirrors direction when the language changes', async ({ page }) => {
  await page.goto('/register');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});
