import { describe, expect, it, vi } from 'vitest';

// Mock MentionTools to avoid DatabaseManager dependency during ToolRegistry construction.
vi.mock('../mention-tools', () => {
  return {
    MentionTools: class MockMentionTools {
      static getToolDefinitions() {
        return [];
      }
    },
  };
});

import { ToolRegistry } from '../registry';

describe('ToolRegistry tool restrictions', () => {
  it('denies all tools when restrictions include "*"', () => {
    const workspace: any = {
      id: 'test-workspace',
      name: 'Test Workspace',
      path: '/mock/workspace',
      permissions: {
        read: true,
        write: true,
        delete: true,
        network: true,
        shell: true,
      },
      createdAt: Date.now(),
    };

    const daemon: any = {
      logEvent: vi.fn(),
      registerArtifact: vi.fn(),
    };

    const registry = new ToolRegistry(workspace, daemon, 'test-task', 'private', ['*']);

    expect(registry.isToolAllowed('read_file')).toBe(false);
    expect(registry.isToolAllowed('web_search')).toBe(false);
    expect(registry.isToolAllowed('spawn_agent')).toBe(false);
  });
});
