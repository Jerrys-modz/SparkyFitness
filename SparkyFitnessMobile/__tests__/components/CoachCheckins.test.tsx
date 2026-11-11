import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { CoachMessage } from '@workspace/shared';
import CoachMessagesCard from '../../src/components/CoachMessagesCard';
import CoachCheckinSettingsSection from '../../src/components/CoachCheckinSettingsSection';
import {
  useCoachCheckinSettings,
  useCoachMessages,
} from '../../src/hooks/useCoachCheckins';
import { coachMessagesToAnnounce } from '../../src/services/coachMessageNotificationService';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});
jest.mock('../../src/components/BottomSheetPicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="hour-picker" /> };
});
jest.mock('../../src/hooks/useCoachCheckins', () => ({
  useCoachMessages: jest.fn(),
  useCoachCheckinSettings: jest.fn(),
}));
jest.mock('../../src/services/api/coachCheckinsApi', () => ({
  fetchCoachMessages: jest.fn(),
}));

const mockMessages = useCoachMessages as jest.MockedFunction<
  typeof useCoachMessages
>;
const mockSettings = useCoachCheckinSettings as jest.MockedFunction<
  typeof useCoachCheckinSettings
>;
const dismissMutate = jest.fn();
const saveMutate = jest.fn();
const checkNowMutate = jest.fn();

const protein: CoachMessage = {
  id: 'd3ebfc08-7f2e-4736-8b08-b8a0cbac2d17',
  coach_id: 'builtin:recovery',
  trigger_type: 'low_protein_after_training',
  entry_date: '2026-11-12',
  facts: { protein: 70, goal: 140 },
  text: null,
  created_at: '2026-11-12T09:07:00.000Z',
  read_at: null,
};

function withMessages(messages: CoachMessage[]) {
  mockMessages.mockReturnValue({
    messages,
    dismiss: { mutate: dismissMutate, isPending: false },
  } as unknown as ReturnType<typeof useCoachMessages>);
}

function withSettings(
  settings: ReturnType<typeof useCoachCheckinSettings>['settings']
) {
  mockSettings.mockReturnValue({
    settings,
    isError: false,
    save: { mutate: saveMutate, isPending: false },
    checkNow: { mutate: checkNowMutate, isPending: false },
  } as unknown as ReturnType<typeof useCoachCheckinSettings>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CoachMessagesCard', () => {
  it('renders nothing when no coach has left a message', () => {
    withMessages([]);
    const { toJSON } = render(<CoachMessagesCard onOpenChat={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it('shows our own sentence with the numbers, or the AI wording', () => {
    withMessages([
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
    const { getByText } = render(<CoachMessagesCard onOpenChat={jest.fn()} />);
    expect(getByText('Recovery Coach')).toBeTruthy();
    expect(
      getByText(/logged 70 g of protein against your 140 g goal/)
    ).toBeTruthy();
    expect(getByText('Consistency Coach')).toBeTruthy();
    expect(getByText('Seven days straight, nicely done.')).toBeTruthy();
  });

  it('dismisses a message and opens the chat as that coach', () => {
    withMessages([protein]);
    const onOpenChat = jest.fn();
    const { getByText, getByLabelText } = render(
      <CoachMessagesCard onOpenChat={onOpenChat} />
    );
    fireEvent.press(getByText('Talk to this coach'));
    expect(useAppPreferencesStore.getState().chatCoachId).toBe(
      'builtin:recovery'
    );
    expect(onOpenChat).toHaveBeenCalled();

    fireEvent.press(getByLabelText('Dismiss'));
    expect(dismissMutate).toHaveBeenCalledWith(protein.id);
  });
});

describe('coachMessagesToAnnounce', () => {
  const now = Date.parse('2026-11-12T12:00:00.000Z');

  it('announces a fresh unread message once', () => {
    expect(coachMessagesToAnnounce([protein], [], now)).toEqual([protein]);
    expect(coachMessagesToAnnounce([protein], [protein.id], now)).toEqual([]);
  });

  it('leaves read and old messages to the Dashboard', () => {
    expect(
      coachMessagesToAnnounce(
        [{ ...protein, read_at: '2026-11-12T10:00:00.000Z' }],
        [],
        now
      )
    ).toEqual([]);
    expect(
      coachMessagesToAnnounce(
        [{ ...protein, created_at: '2026-11-10T09:00:00.000Z' }],
        [],
        now
      )
    ).toEqual([]);
  });
});

describe('CoachCheckinSettingsSection', () => {
  const on = {
    enabled: true,
    coach_ids: ['builtin:consistency'],
    checkin_hour: 9,
    ai_wording: false,
  };

  it('shows only the main switch while check-ins are off', () => {
    withSettings({ ...on, enabled: false });
    const { getByLabelText, queryByText } = render(
      <CoachCheckinSettingsSection />
    );
    expect(queryByText('Check now')).toBeNull();
    fireEvent(getByLabelText('Coach check-ins'), 'valueChange', true);
    expect(saveMutate).toHaveBeenCalledWith(
      { enabled: true },
      expect.anything()
    );
  });

  it('switches a coach on in canonical order', () => {
    withSettings(on);
    const { getByLabelText, queryByLabelText } = render(
      <CoachCheckinSettingsSection />
    );
    fireEvent(getByLabelText('Recovery Coach'), 'valueChange', true);
    expect(saveMutate).toHaveBeenCalledWith(
      { coach_ids: ['builtin:recovery', 'builtin:consistency'] },
      expect.anything()
    );
    expect(queryByLabelText('Macro Timing Coach')).toBeNull();
  });

  it('keeps the phone notification choice on this device', () => {
    withSettings(on);
    const { getByLabelText } = render(<CoachCheckinSettingsSection />);
    fireEvent(getByLabelText('Notify me on this phone'), 'valueChange', false);
    expect(
      useAppPreferencesStore.getState().coachMessageNotificationsEnabled
    ).toBe(false);
    expect(saveMutate).not.toHaveBeenCalled();
  });

  it('runs a check now', () => {
    withSettings(on);
    const { getByText } = render(<CoachCheckinSettingsSection />);
    fireEvent.press(getByText('Check now'));
    expect(checkNowMutate).toHaveBeenCalled();
  });
});
