/**
 * Tests for step failure/verification behavior in TaskExecutor.executeStep
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskExecutor } from '../executor';
import type { LLMResponse } from '../llm';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp'),
  },
}));

vi.mock('../../settings/personality-manager', () => ({
  PersonalityManager: {
    getPersonalityPrompt: vi.fn().mockReturnValue(''),
    getIdentityPrompt: vi.fn().mockReturnValue(''),
  },
}));

vi.mock('../../memory/MemoryService', () => ({
  MemoryService: {
    getContextForInjection: vi.fn().mockReturnValue(''),
  },
}));

function toolUseResponse(name: string, input: Record<string, any>): LLMResponse {
  return {
    stopReason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: `tool-${name}`,
        name,
        input,
      },
    ],
  };
}

function textResponse(text: string): LLMResponse {
  return {
    stopReason: 'end_turn',
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

function createExecutorWithStubs(responses: LLMResponse[], toolResults: Record<string, any>) {
  const executor = Object.create(TaskExecutor.prototype) as any;

  executor.task = {
    id: 'task-1',
    title: 'Test Task',
    prompt: 'Test prompt',
    createdAt: Date.now() - 1000,
  };
  executor.workspace = {
    id: 'workspace-1',
    path: '/tmp',
    permissions: { read: true, write: true, delete: true, network: true, shell: true },
  };
  executor.daemon = { logEvent: vi.fn() };
  executor.contextManager = { compactMessages: vi.fn((messages: any) => messages) };
  executor.checkBudgets = vi.fn();
  executor.updateTracking = vi.fn();
  executor.getAvailableTools = vi.fn().mockReturnValue([
    { name: 'run_command', description: '', input_schema: { type: 'object', properties: {} } },
    { name: 'glob', description: '', input_schema: { type: 'object', properties: {} } },
  ]);
  executor.handleCanvasPushFallback = vi.fn();
  executor.getToolTimeoutMs = vi.fn().mockReturnValue(1000);
  executor.checkFileOperation = vi.fn().mockReturnValue({ blocked: false });
  executor.recordFileOperation = vi.fn();
  executor.recordCommandExecution = vi.fn();
  executor.fileOperationTracker = { getKnowledgeSummary: vi.fn().mockReturnValue('') };
  executor.toolFailureTracker = {
    isDisabled: vi.fn().mockReturnValue(false),
    getLastError: vi.fn().mockReturnValue(''),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn().mockReturnValue(false),
  };
  executor.toolCallDeduplicator = {
    checkDuplicate: vi.fn().mockReturnValue({ isDuplicate: false }),
    recordCall: vi.fn(),
  };
  executor.toolRegistry = {
    executeTool: vi.fn(async (name: string) => {
      if (name in toolResults) return toolResults[name];
      return { success: true };
    }),
  };
  executor.callLLMWithRetry = vi.fn().mockImplementation(async () => {
    const response = responses.shift();
    if (!response) {
      throw new Error('No more LLM responses configured');
    }
    return response;
  });
  executor.abortController = new AbortController();
  executor.taskCompleted = false;
  executor.cancelled = false;

  return executor as TaskExecutor & {
    daemon: { logEvent: ReturnType<typeof vi.fn> };
    toolRegistry: { executeTool: ReturnType<typeof vi.fn> };
  };
}

describe('TaskExecutor executeStep failure handling', () => {
  let executor: ReturnType<typeof createExecutorWithStubs>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks step failed when run_command fails and no recovery occurs', async () => {
    executor = createExecutorWithStubs(
      [
        toolUseResponse('run_command', { command: 'exit 1' }),
        textResponse('done'),
      ],
      {
        run_command: { success: false, exitCode: 1 },
      }
    );

    const step: any = { id: '1', description: 'Execute a command', status: 'pending' };

    await (executor as any).executeStep(step);

    expect(step.status).toBe('failed');
    expect(step.error).toContain('run_command');
  });

  it('marks verification step failed when no new image is found', async () => {
    const oldTimestamp = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    executor = createExecutorWithStubs(
      [
        toolUseResponse('glob', { pattern: '**/*.{png,jpg,jpeg,webp}' }),
        textResponse('checked'),
      ],
      {
        glob: {
          success: true,
          matches: [{ path: 'old.png', modified: oldTimestamp }],
        },
      }
    );

    const step: any = {
      id: '2',
      description: 'Verify: Confirm the generated image file exists and report the result',
      status: 'pending',
    };

    await (executor as any).executeStep(step);

    expect(step.status).toBe('failed');
    expect(step.error).toContain('no newly generated image');
  });
});
