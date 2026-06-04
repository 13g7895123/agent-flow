# E2E Test Setup Guide

## Installation

Playwright is already installed via `bun add -D @playwright/test`.

## First Time Setup

### Install Browsers
```bash
bunx playwright install chromium
```

### Install OS Dependencies (Linux)
```bash
bunx playwright install-deps chromium
```

## Running Tests

### All Tests
```bash
bun run test:e2e
```

### Watch Mode (Recommended for Development)
```bash
bun run test:e2e:ui
```

### Debug Mode
```bash
bun run test:e2e:debug
```

### Single Test File
```bash
bunx playwright test e2e/happy-path.spec.ts
```

### Single Test
```bash
bunx playwright test e2e/happy-path.spec.ts -g "should create agent"
```

## Test Configuration

The `playwright.config.ts` is configured with:
- **Base URL**: `http://localhost:5173` (Vite dev server)
- **Browser**: Chromium
- **Web Server**: Automatically starts `bun run dev`
- **Trace**: Recorded on first retry
- **Report**: HTML report in `playwright-report/`

## Environment Setup

Tests require:
1. Backend API running (default: http://localhost:3001)
2. Frontend dev server (will start automatically)
3. Database and Redis (via docker-compose)

### Start Full Stack for Testing
```bash
# Terminal 1: Start backend and database
docker compose up postgres redis

# Terminal 2: Start backend (if using Go MVP)
cd backend
go run cmd/server/main.go

# Terminal 3: Install and run E2E tests
cd web
bun install
bun run test:e2e
```

## Debugging Tests

### View HTML Report
```bash
bunx playwright show-report
```

### Run with Headed Browser
```bash
bunx playwright test --headed
```

### Generate Code
```bash
bunx playwright codegen http://localhost:5173
```

### Inspect Running Test
```bash
bun run test:e2e:debug
```

## Test Best Practices

1. **Use Relative URLs**: All tests use relative paths, baseURL is configured
2. **Wait for Network**: Use `waitForLoadState('networkidle')` after navigation
3. **Use Selectors**: Prefer `data-testid` over CSS classes for stability
4. **Handle Timing**: Use proper waits instead of `setTimeout`
5. **Resilient Selectors**: Use `isVisible({ timeout: 3000 })` for optional elements

## Adding New Tests

1. Create file in `web/e2e/` with `.spec.ts` extension
2. Use the `test` and `expect` from `@playwright/test`
3. Tests are discovered automatically

Example:
```typescript
import { test, expect } from '@playwright/test';

test('my test', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/My App/);
});
```

## CI Integration

For GitHub Actions:
```yaml
- name: Install Playwright browsers
  run: bunx playwright install --with-deps chromium

- name: Run E2E tests
  run: bun run test:e2e
```

## Common Issues

### "Browser not found"
```bash
bunx playwright install chromium
```

### "Server not responding"
Ensure backend is running and `baseURL` in config matches

### "Timeout waiting for page"
Increase timeout or check if element exists with `isVisible({ timeout: ... })`

### Tests always pass but seem incorrect
Check selectors in headed mode with `bunx playwright test --headed --debug`
