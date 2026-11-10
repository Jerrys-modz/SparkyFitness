import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import SparkySummaryCard from '../../src/components/SparkySummaryCard';
import { useSparkyDailySummary } from '../../src/hooks/useAssistant';
import { addDays, getTodayDate } from '../../src/utils/dateUtils';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});
jest.mock('../../src/hooks/useAssistant', () => ({
  useSparkyDailySummary: jest.fn(),
}));

const mockHook = useSparkyDailySummary as jest.MockedFunction<
  typeof useSparkyDailySummary
>;
const refresh = jest.fn();

function hookResult(
  overrides: Partial<ReturnType<typeof useSparkyDailySummary>>
): ReturnType<typeof useSparkyDailySummary> {
  return {
    summary: undefined,
    isLoading: false,
    isError: false,
    isRefreshing: false,
    refresh,
    ...overrides,
  };
}

const ready = {
  status: 'ready' as const,
  date: getTodayDate(),
  summary: 'You are on track with protein.',
  suggestions: ['A glass of water would help.'],
  generated_at: '2026-11-10T08:00:00.000Z',
};

describe('SparkySummaryCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the summary, its suggestions and a way into chat', () => {
    mockHook.mockReturnValue(hookResult({ summary: ready }));
    const onOpenChat = jest.fn();
    const { getByText } = render(
      <SparkySummaryCard
        selectedDate={getTodayDate()}
        onOpenChat={onOpenChat}
      />
    );
    expect(getByText('You are on track with protein.')).toBeTruthy();
    expect(getByText('A glass of water would help.')).toBeTruthy();
    fireEvent.press(getByText('Ask Sparky more'));
    expect(onOpenChat).toHaveBeenCalled();
  });

  it('asks for a new summary from the refresh button', () => {
    mockHook.mockReturnValue(hookResult({ summary: ready }));
    const { getByLabelText } = render(
      <SparkySummaryCard selectedDate={getTodayDate()} onOpenChat={jest.fn()} />
    );
    fireEvent.press(getByLabelText('Write a new summary'));
    expect(refresh).toHaveBeenCalled();
  });

  it('stays hidden and asks for nothing on another day', () => {
    mockHook.mockReturnValue(hookResult({ summary: ready }));
    const { toJSON } = render(
      <SparkySummaryCard
        selectedDate={addDays(getTodayDate(), -1)}
        onOpenChat={jest.fn()}
      />
    );
    expect(toJSON()).toBeNull();
    expect(mockHook).toHaveBeenCalledWith(false);
  });

  it('explains a missing AI service and an empty day', () => {
    mockHook.mockReturnValue(
      hookResult({
        summary: { ...ready, status: 'no_ai_service', summary: null },
      })
    );
    const first = render(
      <SparkySummaryCard selectedDate={getTodayDate()} onOpenChat={jest.fn()} />
    );
    expect(first.getByText(/Set up an AI service/)).toBeTruthy();

    mockHook.mockReturnValue(
      hookResult({ summary: { ...ready, status: 'no_data', summary: null } })
    );
    const second = render(
      <SparkySummaryCard selectedDate={getTodayDate()} onOpenChat={jest.fn()} />
    );
    expect(second.getByText(/Log a meal/)).toBeTruthy();
  });

  it('says so when the summary could not be written', () => {
    mockHook.mockReturnValue(hookResult({ isError: true }));
    const { getByText } = render(
      <SparkySummaryCard selectedDate={getTodayDate()} onOpenChat={jest.fn()} />
    );
    expect(getByText(/could not write a summary/)).toBeTruthy();
  });
});
