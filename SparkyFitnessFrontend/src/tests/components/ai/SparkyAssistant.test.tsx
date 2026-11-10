import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithClient } from '@/tests/test-utils';
import { SparkySummaryCard } from '@/components/ai/SparkySummaryCard';
import { SparkyMemorySettings } from '@/components/ai/SparkyMemorySettings';
import * as assistantApi from '@/api/Chatbot/assistantService';
import * as preferenceApi from '@/api/Chatbot/foodAssistantService';
import { foodAssistantPreferenceSchema } from '@workspace/shared';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'owner' } }),
}));
jest.mock('@/api/Chatbot/assistantService', () => ({
  loadSparkyDailySummary: jest.fn(),
}));
jest.mock('@/api/Chatbot/foodAssistantService', () => ({
  loadFoodAssistantPreferences: jest.fn(),
  saveFoodAssistantPreference: jest.fn(),
  forgetFoodAssistantPreference: jest.fn(),
}));

const ready = {
  status: 'ready' as const,
  date: '2026-11-10',
  summary: 'You are on track with protein.',
  suggestions: ['A glass of water would help.'],
  generated_at: '2026-11-10T08:00:00.000Z',
};
const diet = foodAssistantPreferenceSchema.parse({
  user_id: '191d765e-f283-4b98-ae69-011e9c33759e',
  key: 'diet',
  value: 'vegetarian',
  source_quote: 'I am vegetarian',
  version: 2,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('SparkySummaryCard', () => {
  it('shows the summary and writes a new one on refresh', async () => {
    jest.mocked(assistantApi.loadSparkyDailySummary).mockResolvedValue(ready);
    renderWithClient(<SparkySummaryCard today="2026-11-10" />);
    expect(
      await screen.findByText('You are on track with protein.')
    ).toBeTruthy();
    expect(screen.getByText('A glass of water would help.')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Write a new summary'));
    await waitFor(() =>
      expect(assistantApi.loadSparkyDailySummary).toHaveBeenCalledWith(true)
    );
  });

  it('explains a missing AI service', async () => {
    jest.mocked(assistantApi.loadSparkyDailySummary).mockResolvedValue({
      ...ready,
      status: 'no_ai_service',
      summary: null,
      suggestions: [],
    });
    renderWithClient(<SparkySummaryCard today="2026-11-10" />);
    expect(await screen.findByText(/Set up an AI service/)).toBeTruthy();
  });

  it('says so when the summary could not be written', async () => {
    jest
      .mocked(assistantApi.loadSparkyDailySummary)
      .mockRejectedValue(new Error('502'));
    renderWithClient(<SparkySummaryCard today="2026-11-10" />);
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /could not write a summary/
    );
  });
});

describe('SparkyMemorySettings', () => {
  it('lists saved preferences and adds one under a key made from its topic', async () => {
    jest
      .mocked(preferenceApi.loadFoodAssistantPreferences)
      .mockResolvedValue([diet]);
    jest
      .mocked(preferenceApi.saveFoodAssistantPreference)
      .mockResolvedValue(diet);
    renderWithClient(
      <SparkyMemorySettings memoryEnabled onMemoryEnabledChange={jest.fn()} />
    );
    expect(await screen.findByText('vegetarian')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Add something to remember'), {
      target: { value: 'Coaching style' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('e.g. Vegetarian, no mushrooms'),
      {
        target: { value: 'Short and direct' },
      }
    );
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() =>
      expect(preferenceApi.saveFoodAssistantPreference).toHaveBeenCalledWith(
        'coaching_style',
        'Short and direct',
        0
      )
    );
  });

  it('deletes a preference at its current version', async () => {
    jest
      .mocked(preferenceApi.loadFoodAssistantPreferences)
      .mockResolvedValue([diet]);
    jest
      .mocked(preferenceApi.forgetFoodAssistantPreference)
      .mockResolvedValue(undefined);
    renderWithClient(
      <SparkyMemorySettings memoryEnabled onMemoryEnabledChange={jest.fn()} />
    );
    fireEvent.click(await screen.findByText('Delete'));
    await waitFor(() =>
      expect(preferenceApi.forgetFoodAssistantPreference).toHaveBeenCalledWith(
        diet
      )
    );
  });

  it('reports the memory switch and keeps the summary switch in this browser', async () => {
    jest
      .mocked(preferenceApi.loadFoodAssistantPreferences)
      .mockResolvedValue([]);
    const onChange = jest.fn();
    renderWithClient(
      <SparkyMemorySettings memoryEnabled onMemoryEnabledChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText('Let Sparky use what it remembers'));
    expect(onChange).toHaveBeenCalledWith(false);

    const summarySwitch = screen.getByLabelText('Daily summary on the Diary');
    expect(summarySwitch.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(summarySwitch);
    await waitFor(() =>
      expect(summarySwitch.getAttribute('aria-checked')).toBe('true')
    );
    expect(localStorage.getItem('sparky.dailySummaryCard.v1')).toBe('on');
  });
});
