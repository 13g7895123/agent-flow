export const ProjectPathValidator = {
  isValidAbsolutePath(path: string): boolean {
    return /^\/[a-zA-Z0-9._\-/]+$/.test(path);
  },

  validateProjectPath(path: string): string | null {
    if (!path.trim()) {
      return '請輸入專案路徑';
    }
    if (!this.isValidAbsolutePath(path)) {
      return '專案路徑必須是絕對路徑 (例如：/home/user/project)';
    }
    return null;
  },
};

export const PipelineStepValidator = {
  validateSteps(
    steps: Array<{ agentId: string; label?: string }>,
    agents: Array<{ id: string; isActive: boolean; name?: string }>
  ): string[] {
    const errors: string[] = [];

    if (steps.length === 0) {
      errors.push('至少需要一個執行步驟');
      return errors;
    }

    // 檢查空步驟
    steps.forEach((step, index) => {
      if (!step.agentId.trim()) {
        errors.push(`步驟 ${index + 1} 尚未選擇 Agent`);
      }
    });

    // 檢查停用 Agent
    const agentMap = new Map(agents.map(a => [a.id, a]));
    steps.forEach((step, index) => {
      const agent = agentMap.get(step.agentId);
      if (agent && !agent.isActive) {
        errors.push(`步驟 ${index + 1} 選用的 Agent 已停用`);
      }
    });

    // 檢查重複 Agent
    const agentCounts = new Map<string, number[]>();
    steps.forEach((step, index) => {
      if (!agentCounts.has(step.agentId)) {
        agentCounts.set(step.agentId, []);
      }
      agentCounts.get(step.agentId)!.push(index + 1);
    });

    for (const [agentId, indices] of agentCounts) {
      if (indices.length > 1) {
        const agentName =
          agentMap.get(agentId)?.name || agentId;
        errors.push(
          `Agent "${agentName}" 被步驟 ${indices.join(', ')} 重複選用`
        );
      }
    }

    return errors;
  },
};
