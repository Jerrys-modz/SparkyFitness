import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { CoachSettings } from '@/pages/Settings/CoachSettings';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/components/ui/accordion', () => ({
  AccordionTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AccordionContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('@/pages/Settings/Coaches/AboutMeCard', () => ({
  AboutMeCard: () => null,
}));
jest.mock('@/pages/Settings/Coaches/CoachKnowledgePanel', () => ({
  CoachKnowledgePanel: () => null,
}));
jest.mock('@/pages/Settings/Coaches/CoachList', () => ({
  CoachList: () => null,
}));
jest.mock('@/pages/Settings/Coaches/CoachScheduleCard', () => ({
  CoachScheduleCard: () => null,
}));
jest.mock('@/contexts/ChatbotVisibilityContext', () => ({
  useChatbotVisibility: () => ({ openChat: jest.fn() }),
}));
jest.mock('@/hooks/Settings/useFeatureChoices', () => ({
  useSetWebFeatureChoice: () => ({ setFeatureOn: jest.fn() }),
}));

const resetToday = jest.fn();
jest.mock('@/hooks/Coaches/useCoaches', () => ({
  useCoachesAvailable: () => true,
  useCoachSettings: () => ({
    data: {
      profile: { checkin_times: ['08:00'], paused_until: null },
      coaches: [],
      last_checkin_at: null,
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useCheckInNow: () => ({ mutate: jest.fn(), isPending: false }),
  useResetTodayCheckin: () => ({ mutate: resetToday, isPending: false }),
}));

beforeEach(() => {
  resetToday.mockClear();
});

describe('CoachSettings', () => {
  it("asks before clearing today's coach messages", () => {
    render(<CoachSettings />);
    fireEvent.click(
      screen.getByRole('button', { name: "Clear today's messages" })
    );
    expect(resetToday).not.toHaveBeenCalled();
    expect(
      screen.getByText("Clear today's coach messages?")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(resetToday).toHaveBeenCalledTimes(1);
  });

  it('clears nothing when cancelled', () => {
    render(<CoachSettings />);
    fireEvent.click(
      screen.getByRole('button', { name: "Clear today's messages" })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(resetToday).not.toHaveBeenCalled();
  });
});
