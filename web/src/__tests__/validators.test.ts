import { describe, it, expect } from 'vitest';
import { ProjectPathValidator, PipelineStepValidator } from '@/lib/validators';

describe('ProjectPathValidator', () => {
  describe('isValidAbsolutePath', () => {
    it('接受有效的絕對路徑', () => {
      expect(ProjectPathValidator.isValidAbsolutePath('/home/user/project')).toBe(true);
      expect(ProjectPathValidator.isValidAbsolutePath('/opt/app/src')).toBe(true);
      expect(ProjectPathValidator.isValidAbsolutePath('/var/www/site_v2')).toBe(true);
    });

    it('拒絕相對路徑', () => {
      expect(ProjectPathValidator.isValidAbsolutePath('./project')).toBe(false);
      expect(ProjectPathValidator.isValidAbsolutePath('../other')).toBe(false);
      expect(ProjectPathValidator.isValidAbsolutePath('project')).toBe(false);
    });

    it('拒絕空字串', () => {
      expect(ProjectPathValidator.isValidAbsolutePath('')).toBe(false);
    });
  });

  describe('validateProjectPath', () => {
    it('驗證必填', () => {
      const result = ProjectPathValidator.validateProjectPath('');
      expect(result).toBe('請輸入專案路徑');
    });

    it('驗證絕對路徑格式', () => {
      const result = ProjectPathValidator.validateProjectPath('relative/path');
      expect(result).toContain('絕對路徑');
    });

    it('有效路徑返回 null', () => {
      const result = ProjectPathValidator.validateProjectPath('/home/user/project');
      expect(result).toBeNull();
    });
  });
});

describe('PipelineStepValidator', () => {
  const mockAgents = [
    { id: 'agent-1', isActive: true, name: 'Agent 1' },
    { id: 'agent-2', isActive: true, name: 'Agent 2' },
    { id: 'agent-3', isActive: false, name: 'Agent 3' },
  ];

  it('檢查空步驟', () => {
    const steps = [
      { agentId: '', label: '' },
    ];
    const errors = PipelineStepValidator.validateSteps(steps, mockAgents);
    expect(errors.some(e => e.includes('尚未選擇 Agent'))).toBe(true);
  });

  it('檢查停用 Agent', () => {
    const steps = [
      { agentId: 'agent-3', label: 'Step 1' },
    ];
    const errors = PipelineStepValidator.validateSteps(steps, mockAgents);
    expect(errors.some(e => e.includes('已停用'))).toBe(true);
  });

  it('檢查重複 Agent', () => {
    const steps = [
      { agentId: 'agent-1', label: 'Step 1' },
      { agentId: 'agent-1', label: 'Step 2' },
    ];
    const errors = PipelineStepValidator.validateSteps(steps, mockAgents);
    expect(errors.some(e => e.includes('重複'))).toBe(true);
  });

  it('有效步驟返回空陣列', () => {
    const steps = [
      { agentId: 'agent-1', label: 'Step 1' },
      { agentId: 'agent-2', label: 'Step 2' },
    ];
    const errors = PipelineStepValidator.validateSteps(steps, mockAgents);
    expect(errors.length).toBe(0);
  });

  it('檢查沒有步驟', () => {
    const steps: any[] = [];
    const errors = PipelineStepValidator.validateSteps(steps, mockAgents);
    expect(errors.some(e => e.includes('至少需要一個'))).toBe(true);
  });
});
