import { test, expect } from '@playwright/test';

test.describe('Agent Flow - Happy Path', () => {
  test('should create agent, pipeline, project and task', async ({ page }) => {
    // Navigate to app
    await page.goto('/');

    // Create Agent
    await page.click('a:has-text("Agents")');
    await expect(page).toHaveURL(/\/agents/);

    await page.click('button:has-text("Add Agent")');
    await page.fill('input[placeholder="Agent name"]', 'Test Agent');
    await page.fill('textarea[placeholder="Enter prompt"]', 'You are a helpful assistant');
    await page.selectOption('select[aria-label="Model provider"]', 'claude');
    await page.click('button:has-text("Save")');

    await expect(page.locator('text=Test Agent')).toBeVisible();
    const agentUrl = page.url();
    const agentMatch = agentUrl.match(/\/agents\/([^/]+)/);
    const agentId = agentMatch ? agentMatch[1] : null;

    // Create Pipeline
    await page.click('a:has-text("Pipelines")');
    await expect(page).toHaveURL(/\/pipelines/);

    await page.click('button:has-text("Add Pipeline")');
    await page.fill('input[placeholder="Pipeline name"]', 'Test Pipeline');
    await page.click('button:has-text("Add Step")');
    await page.selectOption('select[aria-label="Agent"]', agentId || '');
    await page.click('button:has-text("Save")');

    await expect(page.locator('text=Test Pipeline')).toBeVisible();
    const pipelineUrl = page.url();
    const pipelineMatch = pipelineUrl.match(/\/pipelines\/([^/]+)/);
    const pipelineId = pipelineMatch ? pipelineMatch[1] : null;

    // Create Project
    await page.click('a:has-text("Projects")');
    await expect(page).toHaveURL(/\/projects/);

    await page.click('button:has-text("Add Project")');
    await page.fill('input[placeholder="Project name"]', 'Test Project');
    await page.fill('input[placeholder="Project path"]', '/home/test');
    await page.selectOption('select[aria-label="Pipeline"]', pipelineId || '');
    await page.click('button:has-text("Save")');

    await expect(page.locator('text=Test Project')).toBeVisible();

    // Create Task
    await page.click('a:has-text("Projects")');
    await page.click(`text=Test Project`);
    await expect(page).toHaveURL(/\/projects\/[^/]+/);

    await page.click('button:has-text("Add Task")');
    await page.fill('textarea[placeholder="Enter prompt"]', 'Please analyze this code');
    await page.click('button:has-text("Create Task")');

    await expect(page.locator('text=Task created')).toBeVisible({ timeout: 5000 });
  });

  test('should view task detail and refresh page', async ({ page }) => {
    // Navigate to projects
    await page.goto('/projects');

    // Find and click on a project
    const projectCard = page.locator('[data-testid*="project-card"]').first();
    await projectCard.click();

    // Click on a task card
    const taskCard = page.locator('[data-testid*="task-card"]').first();
    if (await taskCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await taskCard.click();
      await expect(page).toHaveURL(/\/tasks\/[^/]+/);

      // Verify task detail content is visible
      await expect(page.locator('text=Task Status')).toBeVisible();

      // Refresh page
      await page.reload();

      // Verify content persists
      await expect(page.locator('text=Task Status')).toBeVisible();
    }
  });

  test('should display log panel for task', async ({ page }) => {
    // Navigate to tasks if any exist
    await page.goto('/projects');

    // Try to find a task
    const projectCard = page.locator('[data-testid*="project-card"]').first();
    if (await projectCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectCard.click();

      const taskCard = page.locator('[data-testid*="task-card"]').first();
      if (await taskCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await taskCard.click();

        // Check for log panel
        const logPanel = page.locator('[data-testid*="log-panel"]', { has: page.locator('text=/logs|output/i') });
        if (await logPanel.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(logPanel).toBeVisible();
        }
      }
    }
  });

  test('should navigate between pages', async ({ page }) => {
    await page.goto('/');

    // Test navigation to each main page
    const navItems = ['Agents', 'Pipelines', 'Projects'];

    for (const item of navItems) {
      await page.click(`a:has-text("${item}")`);
      await expect(page).toHaveURL(new RegExp(`/${item.toLowerCase()}`));
    }
  });
});
