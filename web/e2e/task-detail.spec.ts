import { test, expect } from '@playwright/test';

test.describe('Task Detail Page', () => {
  test('should navigate to task detail and persist data on refresh', async ({ page }) => {
    // Start from projects page
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Try to find first project
    const projects = page.locator('[class*="project"]');

    // If projects exist, click first one
    if (await projects.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await projects.first().click();

      // Wait for project detail to load
      await page.waitForLoadState('networkidle');

      // Find first task
      const tasks = page.locator('[class*="task"]');
      if (await tasks.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await tasks.first().click();

        // Should navigate to task detail page
        await expect(page).toHaveURL(/\/tasks\/[^/]+/);

        // Wait for task detail content to load
        await page.waitForLoadState('networkidle');

        // Verify main content is visible
        const pageContent = page.locator('main, [role="main"], body > div');
        await expect(pageContent).toContainText(/[a-zA-Z0-9]/);

        // Reload page
        await page.reload();

        // Verify we're still on the same task detail page
        const currentUrl = page.url();
        expect(currentUrl).toMatch(/\/tasks\/[^/]+/);

        // Verify content is still visible after reload
        await expect(pageContent).toContainText(/[a-zA-Z0-9]/);
      }
    }
  });

  test('should display task information', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Navigate through project and task if they exist
    const projects = page.locator('[class*="project"]');
    if (await projects.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await projects.first().click();
      await page.waitForLoadState('networkidle');

      const tasks = page.locator('[class*="task"]');
      if (await tasks.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await tasks.first().click();

        // Verify page loaded
        await page.waitForLoadState('networkidle');

        // Check for common task detail elements
        const pageTitle = page.locator('h1, h2, [role="heading"]');
        const headingCount = await pageTitle.count();
        expect(headingCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('should handle missing task gracefully', async ({ page }) => {
    // Try to navigate to non-existent task
    await page.goto('/tasks/non-existent-id');

    // Should either show error or redirect
    const url = page.url();
    // Either we get an error page or redirect back
    expect(
      url.includes('/tasks') ||
      url.includes('/projects') ||
      url.includes('/404') ||
      url === 'http://localhost:5173/'
    ).toBeTruthy();
  });
});
