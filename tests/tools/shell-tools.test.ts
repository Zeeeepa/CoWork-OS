/**
 * Tests for ShellTools auto-approval of similar commands
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GuardrailManager } from '../../src/electron/guardrails/guardrail-manager';
import { AgentDaemon } from '../../src/electron/agent/daemon';
import { Workspace } from '../../src/shared/types';

const mockDaemon = {
  requestApproval: vi.fn().mockResolvedValue(true),
  logEvent: vi.fn(),
} as unknown as AgentDaemon;

const mockWorkspace = {
  id: 'test-workspace',
  name: 'Test Workspace',
  path: '/Users/testuser/project',
  permissions: {
    shell: true,
    read: true,
    write: true,
    delete: true,
    network: true,
  },
} as Workspace;

describe('ShellTools auto-approval', () => {
  let ShellToolsClass: typeof import('../../src/electron/agent/tools/shell-tools').ShellTools;
  let shellTools: InstanceType<typeof ShellToolsClass>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const imported = await import('../../src/electron/agent/tools/shell-tools');
    ShellToolsClass = imported.ShellTools;
    shellTools = new ShellToolsClass(mockWorkspace, mockDaemon, 'task-1');
    vi.spyOn(GuardrailManager, 'isCommandBlocked').mockReturnValue({ blocked: false });
    vi.spyOn(GuardrailManager, 'isCommandTrusted').mockReturnValue({ trusted: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes similar commands to the same signature', () => {
    const shellToolsAny = shellTools as any;
    const sigA = shellToolsAny.getCommandSignature('sips --resampleWidth 1024 "/Users/mesut/Desktop/A.png" --out "/Users/mesut/Desktop/optimized/A.png"');
    const sigB = shellToolsAny.getCommandSignature('sips --resampleWidth 1024 "/Users/mesut/Desktop/B.png" --out "/Users/mesut/Desktop/optimized/B.png"');
    expect(sigA).toBe(sigB);
    expect(sigA).toContain('<arg>');
  });

  it('flags dangerous commands as unsafe for auto-approval', () => {
    const shellToolsAny = shellTools as any;
    expect(shellToolsAny.isAutoApprovalSafe('rm -rf "/Users/mesut/Desktop/tmp1"')).toBe(false);
    expect(shellToolsAny.isAutoApprovalSafe('sips --resampleWidth 1024 "/Users/mesut/Desktop/A.png" --out "/Users/mesut/Desktop/optimized/A.png"')).toBe(true);
  });
});
