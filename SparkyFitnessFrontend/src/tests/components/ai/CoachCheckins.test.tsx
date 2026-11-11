import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithClient } from '@/tests/test-utils';
import { CoachMessagesCard } from '@/components/ai/CoachMessagesCard';
import { CoachCheckinSettings } from '@/components/ai/CoachCheckinSettings';
import * as api from '@/api/Chatbot/coachCheckinService';
import { getSelectedCoachId } from '@/utils/chatCoachSelection';

const mockOpenChat = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      options?: string | { defaultValue?: string; [name: string]: unknown }
    ) => {
      if (typeof options === 'string') return options;
      return (options?.defaultValue ?? '').replace(
        /\{\{(\w+)\}\}/g,
        (_match: string, name: string) => String(options?.[name])
      );
    },
  }),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'owner' } }),
}));
jest.mock('@/contexts/ChatbotVisibilityContext', () => ({
  useChatbotVisibility: () => ({ openChat: mockOpenChat }),
}));
jest.mock('@/utils/chatConversationId', () => ({
  rotateAllChatConversationIds: jest.fn(),
}));
jest.mock('@/api/Chatbot/coachCheckinService', () => ({
  loadCoachCheckinSettings: jest.fn(),
  saveCoachCheckinSettings: jest.fn(),
  loadCoachMessages: jest.fn(),
  dismissCoachMessage: jest.fn(),
  runCoachCheckNow: jest.fn(),
}));

const protein = {
  id: 'd3ebfc08-7f2e-4736-8b08-b8a0cbac2d17',
  coach_id: 'builtin:recovery',
  trigger_type: 'low_protein_after_training' as const,
  entry_date: '2026-11-12',
  facts: { protein: 70, goal: 140 },
  text: null,
  created_at: '2026-11-12T09:07:00.000Z',
  read_at: null,
};
const settings = {
  enabled: true,
  coach_ids: ['builtin:recovery'],
  checkin_hour: 9,
  ai_wording: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('CoachMessagesCard', () => {
  it('renders nothing when no coach has left a message', async () => {
    jest.mocked(api.loadCoachMessages).mockResolvedValue([]);
    const { container } = renderWithClient(<CoachMessagesCard />);
    await waitFor(() => expect(api.loadCoachMessages).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('shows our own sentence with the numbers, or the AI wording when there is one', async () => {
    jest.mocked(api.loadCoachMessages).mockResolvedValue([
      protein,
      {
        ...protein,
        id: 'a3ebfc08-7f2e-4736-8b08-b8a0cbac2d17',
        coach_id: 'builtin:consistency',
        trigger_type: 'streak_milestone',
        facts: { days: 7 },
        text: 'Seven days straight, nicely done.',
      },
    ]);
    renderWithClient(<CoachMessagesCard />);
    expect(await screen.findByText('Recovery Coach')).toBeTruthy();
    expect(
      screen.getByText(/logged 70 g of protein against your 140 g goal/)
    ).toBeTruthy();
    expect(screen.getByText('Consistency Coach')).toBeTruthy();
    expect(screen.getByText('Seven days straight, nicely done.')).toBeTruthy();
  });

  it('dismisses a message and opens the chat as that coach', async () => {
    jest.mocked(api.loadCoachMessages).mockResolvedValue([protein]);
    jest.mocked(api.dismissCoachMessage).mockResolvedValue(undefined);
    renderWithClient(<CoachMessagesCard />);

    fireEvent.click(await screen.findByText('Talk to this coach'));
    expect(getSelectedCoachId()).toBe('builtin:recovery');
    expect(mockOpenChat).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Dismiss'));
    await waitFor(() =>
      expect(api.dismissCoachMessage).toHaveBeenCalledWith(protein.id)
    );
  });
});

describe('CoachCheckinSettings', () => {
  it('shows only the main switch while check-ins are off', async () => {
    jest
      .mocked(api.loadCoachCheckinSettings)
      .mockResolvedValue({ ...settings, enabled: false });
    jest.mocked(api.saveCoachCheckinSettings).mockResolvedValue(settings);
    renderWithClient(<CoachCheckinSettings />);
    const main = screen.getByRole('switch', { name: 'Coach check-ins' });
    await waitFor(() => expect(main.hasAttribute('disabled')).toBe(false));
    expect(screen.queryByText('Check now')).toBeNull();

    fireEvent.click(main);
    await waitFor(() =>
      expect(api.saveCoachCheckinSettings).toHaveBeenCalledWith({
        enabled: true,
      })
    );
  });

  it('switches a coach on in canonical order and off again', async () => {
    jest.mocked(api.loadCoachCheckinSettings).mockResolvedValue({
      ...settings,
      coach_ids: ['builtin:consistency'],
    });
    jest.mocked(api.saveCoachCheckinSettings).mockResolvedValue(settings);
    renderWithClient(<CoachCheckinSettings />);

    fireEvent.click(await screen.findByLabelText('Recovery Coach'));
    await waitFor(() =>
      expect(api.saveCoachCheckinSettings).toHaveBeenCalledWith({
        coach_ids: ['builtin:recovery', 'builtin:consistency'],
      })
    );
    expect(screen.queryByLabelText('Macro Timing Coach')).toBeNull();
  });

  it('runs a check now and says what it found', async () => {
    jest.mocked(api.loadCoachCheckinSettings).mockResolvedValue(settings);
    jest.mocked(api.runCoachCheckNow).mockResolvedValue({ created: 0 });
    renderWithClient(<CoachCheckinSettings />);
    fireEvent.click(await screen.findByText('Check now'));
    expect(await screen.findByText('Nothing to say right now.')).toBeTruthy();
  });
});
