import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithClient } from '@/tests/test-utils';
import { ChatCoachSelector } from '@/components/ai/ChatCoachSelector';
import { CoachSettings } from '@/components/ai/CoachSettings';
import * as api from '@/api/Chatbot/coachService';
import {
  getSelectedCoachId,
  setSelectedCoachId,
} from '@/utils/chatCoachSelection';
import { rotateAllChatConversationIds } from '@/utils/chatConversationId';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'owner' } }),
}));
jest.mock('@/api/Chatbot/coachService', () => ({
  loadCoaches: jest.fn(),
  createCoach: jest.fn(),
  updateCoach: jest.fn(),
  deleteCoach: jest.fn(),
}));
jest.mock('@/utils/chatConversationId', () => ({
  rotateAllChatConversationIds: jest.fn(),
}));

const marathon = {
  id: 'd3ebfc08-7f2e-4736-8b08-b8a0cbac2d17',
  name: 'Marathon coach',
  description: 'For my spring race',
  system_prompt: 'Focus on my marathon build.',
  tool_categories: ['exercise' as const, 'reports' as const],
  created_at: '2026-11-11T00:00:00.000Z',
  updated_at: '2026-11-11T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  jest.mocked(api.loadCoaches).mockResolvedValue([marathon]);
});

describe('chat coach selection', () => {
  it('starts on Sparky and starts a new conversation when the coach changes', () => {
    expect(getSelectedCoachId()).toBeNull();
    setSelectedCoachId('builtin:recovery');
    expect(getSelectedCoachId()).toBe('builtin:recovery');
    expect(rotateAllChatConversationIds).toHaveBeenCalledTimes(1);

    setSelectedCoachId('builtin:recovery');
    expect(rotateAllChatConversationIds).toHaveBeenCalledTimes(1);

    setSelectedCoachId(null);
    expect(getSelectedCoachId()).toBeNull();
    expect(rotateAllChatConversationIds).toHaveBeenCalledTimes(2);
  });
});

describe('ChatCoachSelector', () => {
  it('offers Sparky, the built-in coaches and the person’s own', async () => {
    renderWithClient(<ChatCoachSelector />);
    fireEvent.click(screen.getByLabelText('Choose a coach'));
    expect(await screen.findByText('Marathon coach')).toBeTruthy();
    expect(screen.getByText('Recovery Coach')).toBeTruthy();
    expect(screen.getByText('Sleep and Recovery Coach')).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: /Sparky/ }).getAttribute('aria-checked')
    ).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: /Marathon coach/ }));
    expect(getSelectedCoachId()).toBe(marathon.id);
    await waitFor(() =>
      expect(
        screen
          .getByRole('radio', { name: /Marathon coach/ })
          .getAttribute('aria-checked')
      ).toBe('true')
    );
  });

  it('shows Sparky as chosen when the stored coach no longer exists', async () => {
    setSelectedCoachId('00000000-0000-4000-8000-000000000000');
    renderWithClient(<ChatCoachSelector />);
    fireEvent.click(screen.getByLabelText('Choose a coach'));
    await screen.findByText('Marathon coach');
    expect(
      screen.getByRole('radio', { name: /Sparky/ }).getAttribute('aria-checked')
    ).toBe('true');
  });
});

describe('CoachSettings', () => {
  it('creates a coach with its tools in canonical order', async () => {
    jest.mocked(api.createCoach).mockResolvedValue(marathon);
    renderWithClient(<CoachSettings />);
    await screen.findByText('Marathon coach');

    fireEvent.click(screen.getByText('Add a coach'));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: ' Night owl ' },
    });
    fireEvent.change(screen.getByLabelText('Instructions'), {
      target: { value: 'Keep it short.' },
    });
    // Starts with Food & Water and Exercise; add Goals, drop Exercise.
    fireEvent.click(screen.getByText('Goals'));
    fireEvent.click(screen.getByText('Exercise'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(api.createCoach).toHaveBeenCalledWith({
        name: 'Night owl',
        description: null,
        system_prompt: 'Keep it short.',
        tool_categories: ['food', 'goals'],
      })
    );
  });

  it('will not save a coach with no tools', async () => {
    renderWithClient(<CoachSettings />);
    await screen.findByText('Marathon coach');
    fireEvent.click(screen.getByText('Add a coach'));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Empty' },
    });
    fireEvent.change(screen.getByLabelText('Instructions'), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByText('Food & Water'));
    fireEvent.click(screen.getByText('Exercise'));
    expect(screen.getByText('Save').closest('button')?.disabled).toBe(true);
  });

  it('edits and deletes an existing coach', async () => {
    jest.mocked(api.updateCoach).mockResolvedValue(marathon);
    jest.mocked(api.deleteCoach).mockResolvedValue(undefined);
    renderWithClient(<CoachSettings />);
    fireEvent.click(await screen.findByText('Edit'));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Half marathon coach' },
    });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(api.updateCoach).toHaveBeenCalledWith(
        marathon.id,
        expect.objectContaining({
          name: 'Half marathon coach',
          tool_categories: ['exercise', 'reports'],
        })
      )
    );

    fireEvent.click(await screen.findByText('Delete'));
    await waitFor(() =>
      expect(api.deleteCoach).toHaveBeenCalledWith(marathon.id)
    );
  });
});
