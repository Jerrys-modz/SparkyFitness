import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFoodAssistantTools } from '../ai/tools/foodAssistantTools.js';
import * as foodAssistantService from '../services/foodAssistantService.js';
import { isAssistantMemoryEnabled } from '../services/assistantMemoryService.js';
import { buildFinalSystemPrompt } from '../services/chatService.js';

vi.mock('../services/foodAssistantService.js');
vi.mock('../services/assistantMemoryService.js');
vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging', () => ({ log: vi.fn() }));

const options = { toolCallId: 'call-1', messages: [] };

async function run(input: Record<string, unknown>): Promise<unknown> {
  const tool = buildFoodAssistantTools('user-1').sparky_food_assistant_state;
  return tool.execute?.(input as never, options as never);
}

describe('saved preferences while memory is switched off', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAssistantMemoryEnabled).mockResolvedValue(false);
  });

  it('does not read them', async () => {
    const result = await run({ action: 'list_preferences' });
    expect(result).toContain('turned off in settings');
    expect(foodAssistantService.listPreferences).not.toHaveBeenCalled();
  });

  it('does not save new ones', async () => {
    const result = await run({
      action: 'remember_preference',
      preference: {
        key: 'diet',
        value: 'vegetarian',
        source_quote: 'Remember I am vegetarian',
      },
    });
    expect(result).toContain('turned off in settings');
    expect(foodAssistantService.rememberPreference).not.toHaveBeenCalled();
  });

  it('still lets the person clear one', async () => {
    vi.mocked(foodAssistantService.forgetPreference).mockResolvedValue();
    const result = await run({
      action: 'forget_preference',
      key: 'diet',
      expected_version: 1,
      source_quote: 'Forget my diet preference',
    });
    expect(result).toBe('Preference forgotten.');
  });

  it('reads them again once memory is on', async () => {
    vi.mocked(isAssistantMemoryEnabled).mockResolvedValue(true);
    vi.mocked(foodAssistantService.listPreferences).mockResolvedValue([]);
    expect(await run({ action: 'list_preferences' })).toBe('[]');
  });
});

describe('buildFinalSystemPrompt', () => {
  it('puts saved preferences after the base prompt and before the service instructions', () => {
    const prompt = buildFinalSystemPrompt('BASE', 'Be brief.', 'MEMORY');
    expect(prompt).toBe(
      'BASE\n\nMEMORY\n\n## Additional Instructions\nBe brief.'
    );
  });

  it('leaves the prompt unchanged when nothing is saved', () => {
    expect(buildFinalSystemPrompt('BASE', null, '')).toBe('BASE');
    expect(buildFinalSystemPrompt('BASE', ' Be brief. ')).toBe(
      'BASE\n\n## Additional Instructions\nBe brief.'
    );
  });
});
