import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { tool } from 'ai';

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

const { logWater } = vi.hoisted(() => ({
  logWater: vi.fn(async (input: { ml: number }) => ({ logged: input.ml })),
}));

vi.mock('../ai/tools/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai/tools/index.js')>();
  return {
    ...actual,
    buildChatToolSurface: () => ({
      tools: {
        sparky_log_water: tool({
          description: 'Logs water.',
          inputSchema: z.object({ ml: z.number() }),
          execute: logWater,
        }),
        sparky_get_report: tool({
          description: 'Reads a report.',
          inputSchema: z.object({}),
          execute: async () => ({ ok: true }),
        }),
      },
      toolNamesByCategory: {
        food: ['sparky_log_water'],
        exercise: [],
        checkin: [],
        goals: [],
        reports: ['sparky_get_report'],
        coaching: [],
        vision: [],
        profile: [],
        medications: [],
      },
    }),
  };
});

import {
  listOnDeviceChatTools,
  OnDeviceToolError,
  runOnDeviceChatTool,
} from '../services/onDeviceChatToolService.js';

describe('onDeviceChatToolService', () => {
  beforeEach(() => {
    logWater.mockClear();
  });

  it('lists the core categories by default, with JSON Schema inputs', async () => {
    const tools = await listOnDeviceChatTools('user-1');
    expect(tools.map((t) => t.name)).toEqual(['sparky_log_water']);
    expect(tools[0]).toMatchObject({
      description: 'Logs water.',
      category: 'food',
    });
    expect(tools[0].parameters).toMatchObject({
      type: 'object',
      properties: { ml: { type: 'number' } },
    });
  });

  it('lists only the requested categories and ignores unknown ones', async () => {
    const tools = await listOnDeviceChatTools('user-1', [
      'reports',
      'nonsense',
    ]);
    expect(tools.map((t) => t.name)).toEqual(['sparky_get_report']);
  });

  it('runs a tool with validated arguments', async () => {
    const result = await runOnDeviceChatTool('user-1', 'sparky_log_water', {
      ml: 250,
    });
    expect(result).toEqual({ logged: 250 });
    expect(logWater).toHaveBeenCalledOnce();
  });

  it('rejects arguments the tool does not accept', async () => {
    await expect(
      runOnDeviceChatTool('user-1', 'sparky_log_water', { ml: 'lots' })
    ).rejects.toMatchObject({ status: 400 });
    expect(logWater).not.toHaveBeenCalled();
  });

  it('refuses an unknown tool and one outside the requested categories', async () => {
    await expect(
      runOnDeviceChatTool('user-1', 'sparky_nope', {})
    ).rejects.toBeInstanceOf(OnDeviceToolError);
    await expect(
      runOnDeviceChatTool('user-1', 'sparky_get_report', {})
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      runOnDeviceChatTool('user-1', 'sparky_get_report', {}, ['reports'])
    ).resolves.toEqual({ ok: true });
  });
});
