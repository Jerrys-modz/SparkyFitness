import { beforeEach, describe, expect, it, vi } from 'vitest';
import chatRepository from '../models/chatRepository.js';
import coachRepository from '../models/coachRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { listPreferences } from '../models/foodAssistantRepository.js';
import goalService from '../services/goalService.js';
import { dispatchAiRequest } from '../ai/providerDispatch.js';
import {
  buildDailySummaryPrompt,
  clearDailySummaryCache,
  DailySummaryProviderError,
  getDailySummary,
} from '../services/assistantDailySummaryService.js';
import {
  buildAssistantMemoryPromptSection,
  formatAssistantMemory,
} from '../services/assistantMemoryService.js';

vi.mock('../models/chatRepository');
vi.mock('../models/coachRepository');
vi.mock('../models/preferenceRepository');
vi.mock('../models/foodAssistantRepository.js');
vi.mock('../services/goalService');
vi.mock('../ai/providerDispatch.js');
vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../utils/outboundUrlPolicy.js', () => ({
  resolveAiNetworkPolicy: vi.fn().mockResolvedValue({}),
}));

const USER = 'user-1';
const emptyDay = { calories: 0, protein: 0, carbs: 0, fat: 0, entry_count: 0 };
const loggedDay = {
  calories: 1450.4,
  protein: 82.2,
  carbs: 150,
  fat: 48,
  entry_count: 5,
};

function mockData(nutrition = loggedDay) {
  vi.mocked(coachRepository.getDayNutritionTotals).mockResolvedValue(nutrition);
  vi.mocked(coachRepository.getDayExerciseNames).mockResolvedValue([]);
  vi.mocked(coachRepository.getWaterIntakeTotal).mockResolvedValue({
    total_water: 0,
  });
}

function mockAiService() {
  vi.mocked(chatRepository.getActiveAiServiceSetting).mockResolvedValue({
    id: 'svc-1',
  });
  vi.mocked(chatRepository.getAiServiceSettingForBackend).mockResolvedValue({
    id: 'svc-1',
    service_type: 'openai',
    model_name: 'gpt-test',
    api_key: 'sk-test',
    custom_url: null,
  });
}

describe('getDailySummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearDailySummaryCache();
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      assistant_memory_enabled: true,
      language: 'en',
      energy_unit: 'kcal',
    });
    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2000,
      protein: 140,
      water_goal_ml: 2500,
    });
    vi.mocked(listPreferences).mockResolvedValue([]);
    vi.mocked(dispatchAiRequest).mockResolvedValue({
      ok: true,
      text: '',
      json: {
        summary: 'You logged five foods.',
        suggestions: ['One', 'Two', 'Three'],
      },
    });
  });

  it('makes no AI request without an AI service', async () => {
    vi.mocked(chatRepository.getActiveAiServiceSetting).mockResolvedValue(null);
    mockData();
    const result = await getDailySummary(USER);
    expect(result.status).toBe('no_ai_service');
    expect(result.summary).toBeNull();
    expect(dispatchAiRequest).not.toHaveBeenCalled();
  });

  it('makes no AI request when nothing was logged today or yesterday', async () => {
    mockAiService();
    mockData(emptyDay);
    const result = await getDailySummary(USER);
    expect(result.status).toBe('no_data');
    expect(dispatchAiRequest).not.toHaveBeenCalled();
  });

  it('returns the summary with at most two suggestions', async () => {
    mockAiService();
    mockData();
    const result = await getDailySummary(USER);
    expect(result.status).toBe('ready');
    expect(result.summary).toBe('You logged five foods.');
    expect(result.suggestions).toEqual(['One', 'Two']);
    expect(result.generated_at).not.toBeNull();
  });

  it('reuses a summary until a refresh is asked for', async () => {
    mockAiService();
    mockData();
    await getDailySummary(USER);
    await getDailySummary(USER);
    expect(dispatchAiRequest).toHaveBeenCalledTimes(1);
    await getDailySummary(USER, { refresh: true });
    expect(dispatchAiRequest).toHaveBeenCalledTimes(2);
  });

  it('gives the AI the saved preferences only while memory is on', async () => {
    mockAiService();
    mockData();
    vi.mocked(listPreferences).mockResolvedValue([
      {
        user_id: USER,
        key: 'diet',
        value: 'vegetarian',
        source_quote: 'I am vegetarian',
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    await getDailySummary(USER);
    expect(vi.mocked(dispatchAiRequest).mock.calls[0][0].prompt).toContain(
      '- diet: vegetarian'
    );

    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      assistant_memory_enabled: false,
    });
    await getDailySummary(USER, { refresh: true });
    const prompt = vi.mocked(dispatchAiRequest).mock.calls[1][0].prompt;
    expect(prompt).not.toContain('vegetarian');
    expect(prompt).toContain('(nothing saved)');
  });

  it('reports a provider failure without caching it', async () => {
    mockAiService();
    mockData();
    vi.mocked(dispatchAiRequest).mockResolvedValueOnce({
      ok: false,
      category: 'timeout',
      detail: 'timed out',
    });
    await expect(getDailySummary(USER)).rejects.toBeInstanceOf(
      DailySummaryProviderError
    );
    const result = await getDailySummary(USER);
    expect(result.status).toBe('ready');
  });

  it('treats a half-configured service as no AI service', async () => {
    mockAiService();
    mockData();
    vi.mocked(dispatchAiRequest).mockResolvedValueOnce({
      ok: false,
      category: 'api_key_missing',
      detail: 'no key',
    });
    expect((await getDailySummary(USER)).status).toBe('no_ai_service');
  });

  it('rejects an answer in the wrong shape', async () => {
    mockAiService();
    mockData();
    vi.mocked(dispatchAiRequest).mockResolvedValueOnce({
      ok: true,
      text: '',
      json: { summary: '' },
    });
    await expect(getDailySummary(USER)).rejects.toBeInstanceOf(
      DailySummaryProviderError
    );
  });
});

describe('buildDailySummaryPrompt', () => {
  const day = { nutrition: loggedDay, exercises: ['Squat'], waterMl: 500 };
  const base = {
    today: day,
    yesterday: { nutrition: emptyDay, exercises: [], waterMl: 0 },
    goals: { calories: 2000, protein: null, waterMl: null },
    memory: '',
    language: 'de',
    energyUnit: 'kJ',
  };

  it('states logged numbers, unknowns, language and energy unit', () => {
    const prompt = buildDailySummaryPrompt(base);
    expect(prompt).toContain('1450 kcal, 82 g protein');
    expect(prompt).toContain('exercise logged: Squat');
    expect(prompt).toContain('Yesterday: no food logged');
    expect(prompt).toContain('Daily goals: 2000 kcal.');
    expect(prompt).toContain('language with code "de"');
    expect(prompt).toContain('Show energy in kJ');
  });
});

describe('assistant memory formatting', () => {
  it('returns no prompt section when nothing is saved', () => {
    expect(buildAssistantMemoryPromptSection([])).toBe('');
  });

  it('lists each preference on one bounded line', () => {
    const text = formatAssistantMemory([
      { key: 'coaching_style', value: 'direct\nand short' },
      { key: 'long', value: 'x'.repeat(500) },
    ]);
    const [first, second] = text.split('\n');
    expect(first).toBe('- coaching style: direct and short');
    expect(second.length).toBeLessThan(320);
    expect(
      buildAssistantMemoryPromptSection([{ key: 'a', value: 'b' }])
    ).toContain('## What the user asked you to remember');
  });
});
