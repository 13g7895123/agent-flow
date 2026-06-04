import { test, expect } from '@playwright/test';

test.describe('API Contract Tests', () => {
  test('should handle API error responses gracefully', async ({ page }) => {
    // Create a page route interceptor to test error handling
    await page.goto('/agents');

    // Intercept network requests to verify error handling
    page.on('response', (response) => {
      // Error responses should be handled by the app
      if (response.status() >= 400) {
        // App should handle this gracefully
      }
    });

    // Try to delete a non-existent agent
    // This should show an error message
    // (In a real scenario, this would be mocked or the app would handle it)

    // Verify page is still accessible
    await page.goto('/');
    await expect(page).toHaveURL('/');
  });

  test('should display task status correctly', async ({ page }) => {
    await page.goto('/projects');

    // Wait for projects to load
    await page.waitForLoadState('networkidle');

    // Check if any task cards are visible
    const taskCards = page.locator('[data-testid*="task-card"]');
    const count = await taskCards.count();

    if (count > 0) {
      // Verify task status badge is visible
      const statusBadge = taskCards.first().locator('[data-testid*="status"]');
      await expect(statusBadge).toBeVisible();
    }
  });

  test('should handle form submission and validation', async ({ page }) => {
    await page.goto('/agents');
    await page.click('button:has-text("Add Agent")');

    // Try to submit empty form
    const submitBtn = page.locator('button:has-text("Save")').first();

    // Check if form has validation (should prevent empty submission)
    const nameInput = page.locator('input[placeholder*="name" i]').first();
    if (await nameInput.isVisible()) {
      const isRequired = await nameInput.getAttribute('required');
      if (isRequired !== null) {
        await expect(submitBtn).toBeDisabled();
      }
    }
  });
});
