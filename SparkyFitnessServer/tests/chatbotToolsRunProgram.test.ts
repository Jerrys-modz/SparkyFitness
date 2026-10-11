import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../models/runProgramRepository.js', () => ({
  getRunProgram: vi.fn(),
  upsertRunProgram: vi.fn(),
  adjustRunProgram: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { findProgram, type RunProgramResponse } from '@workspace/shared';
import {
  adjustRunProgram,
  getRunProgram,
  upsertRunProgram,
} from '../models/runProgramRepository.js';
import { buildRunProgramTools } from '../ai/tools/runProgramTools.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

const tool = buildRunProgramTools('user-1', 'UTC').sparky_manage_run_program;
const run = (args: Record<string, unknown>) =>
  (tool.execute as (a: unknown, o: unknown) => Promise<string>)(args, toolOpts);

const program = (overrides: Partial<RunProgramResponse> = {}) =>
  ({
    id: 'p1',
    program_id: 'beginner5k',
    enabled: true,
    next_index: 4,
    workouts: findProgram('beginner5k')!.workouts,
    adjustment_log: [],
    updated_at: '2026-10-10T00:00:00.000Z',
    ...overrides,
  }) as RunProgramResponse;

beforeEach(() => vi.clearAllMocks());

describe('sparky_manage_run_program', () => {
  it('says there is no program rather than assuming one', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(null);
    expect(await run({ action: 'get_run_program' })).toContain(
      'not following a run program'
    );
  });

  it('reports progress, the next workouts and recent changes', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(
      program({
        adjustment_log: [
          {
            at: '2026-10-09T10:00:00.000Z',
            summary: 'Repeating week 2.',
            source: 'assistant',
          },
        ],
      })
    );
    const text = await run({ action: 'get_run_program' });
    expect(text).toContain('4 of 27 workouts done');
    expect(text).toContain('week 2, run 2');
    expect(text).toContain('Repeating week 2.');
  });

  it('asks for confirmation and changes nothing without it', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program());
    const text = await run({
      action: 'adjust_run_program_running',
      percent: -20,
      count: 2,
    });
    expect(text).toContain('Confirm with the user first');
    expect(adjustRunProgram).not.toHaveBeenCalled();
  });

  it('applies a confirmed change as the assistant', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program());
    vi.mocked(adjustRunProgram).mockResolvedValue(
      program({
        adjustment_log: [
          {
            at: '2026-10-10T10:00:00.000Z',
            summary: 'Eased the running in the next 2 workouts by 20%.',
            source: 'assistant',
          },
        ],
      })
    );
    const text = await run({
      action: 'adjust_run_program_running',
      percent: -20,
      count: 2,
      confirmed: true,
    });
    expect(adjustRunProgram).toHaveBeenCalledWith(
      'user-1',
      'assistant',
      expect.any(Function),
      'user-1'
    );
    expect(text).toContain('Eased the running in the next 2 workouts');
  });

  it('refuses an increase beyond the limit at validation', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program());
    const text = await run({
      action: 'adjust_run_program_running',
      percent: 25,
      confirmed: true,
    });
    expect(adjustRunProgram).not.toHaveBeenCalled();
    expect(text.toLowerCase()).toContain('percent');
  });

  it('rejects a week that does not exist', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program());
    const text = await run({
      action: 'repeat_run_program_week',
      week: 30,
      confirmed: true,
    });
    expect(text).toContain('There is no week 30');
    expect(adjustRunProgram).not.toHaveBeenCalled();
  });

  it('starts the default program once confirmed', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(null);
    vi.mocked(upsertRunProgram).mockResolvedValue(program({ next_index: 0 }));
    expect(await run({ action: 'start_run_program' })).toContain(
      'Confirm with the user first'
    );
    const text = await run({ action: 'start_run_program', confirmed: true });
    expect(upsertRunProgram).toHaveBeenCalledWith(
      'user-1',
      { program_id: 'beginner5k', enabled: true },
      'user-1'
    );
    expect(text).toContain('Run program started');
  });

  it('says so when asked to start the program already held, rather than claiming a restart', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program({ next_index: 5 }));
    vi.mocked(upsertRunProgram).mockResolvedValue(program({ next_index: 5 }));
    const text = await run({ action: 'start_run_program', confirmed: true });
    expect(text).toContain('already on this program');
    expect(text).not.toContain('Run program started');
  });

  it('refuses a run number the week does not have', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program());
    const text = await run({
      action: 'move_run_program',
      week: 1,
      run: 7,
      confirmed: true,
    });
    expect(text).toContain('has 3 runs');
    expect(adjustRunProgram).not.toHaveBeenCalled();
  });

  it('switches the program off, keeping the place', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program());
    vi.mocked(upsertRunProgram).mockResolvedValue(program({ enabled: false }));
    const text = await run({
      action: 'set_run_program_enabled',
      enabled: false,
      confirmed: true,
    });
    expect(upsertRunProgram).toHaveBeenCalledWith(
      'user-1',
      { program_id: 'beginner5k', enabled: false },
      'user-1'
    );
    expect(text).toContain('switched off');
  });
});
