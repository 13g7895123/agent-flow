import { test as base, expect } from '@playwright/test';

type TestFixtures = {
  testData: {
    agentName: string;
    pipelineName: string;
    projectName: string;
    projectPath: string;
    taskPrompt: string;
  };
};

export const test = base.extend<TestFixtures>({
  testData: {
    agentName: 'E2E Test Agent',
    pipelineName: 'E2E Test Pipeline',
    projectName: 'E2E Test Project',
    projectPath: '/tmp/e2e-test-project',
    taskPrompt: 'E2E Test Task Prompt',
  },
});

export { expect };
