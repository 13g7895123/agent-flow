# E2E Tests (Playwright)

This directory contains end-to-end tests for the Agent Flow application.

## Structure

- `happy-path.spec.ts` - Main happy path test: Create Agent → Pipeline → Project → Task
- `api-contract.spec.ts` - API contract and error handling tests
- `fixtures.ts` - Shared test fixtures and data

## Running Tests

### Run all E2E tests
```bash
bun run test:e2e
```

### Run with UI (watch mode)
```bash
bun run test:e2e:ui
```

### Run in debug mode
```bash
bun run test:e2e:debug
```

### Run specific test file
```bash
bunx playwright test e2e/happy-path.spec.ts
```

### Run tests with a specific browser
```bash
bunx playwright test --project=chromium
```

## Prerequisites

- Backend API running on http://localhost:3001 (or configured baseURL)
- Frontend dev server will start automatically (configured in playwright.config.ts)

## Test Scenarios

### W4-TD: Playwright Draft

1. **Create Flow Test** (`happy-path.spec.ts`)
   - Creates an Agent
   - Creates a Pipeline with that Agent
   - Creates a Project with that Pipeline
   - Creates a Task in the Project

2. **Task Detail & Refresh Test** (`happy-path.spec.ts`)
   - Opens task detail page
   - Verifies content is visible
   - Reloads page
   - Verifies data persists

3. **Log Panel Test** (`happy-path.spec.ts`)
   - Views task details
   - Verifies log panel displays correctly

4. **Navigation Test** (`happy-path.spec.ts`)
   - Tests navigation between main pages (Agents, Pipelines, Projects)

5. **API Error Handling** (`api-contract.spec.ts`)
   - Tests error response handling
   - Tests form validation
   - Tests status display

## Development Tips

- Use `test.only()` to run a single test
- Use `page.pause()` to pause execution and inspect the page
- Check `playwright-report/` folder for HTML reports after test runs
- Set `trace: 'on'` in config for full network/interaction traces

## Notes

- Tests use `baseURL: 'http://localhost:5173'` (Vite dev server)
- Playwright will automatically start the dev server if not running
- Tests should be resilient to timing (use proper waits and retries)
- For dynamic test data, use test fixtures to share setup code
