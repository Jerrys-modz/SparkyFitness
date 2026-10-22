import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { CompareResponse } from '@workspace/shared';

import CompareReportScreen from '../../src/screens/CompareReportScreen';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';
import { getTodayDate } from '../../src/utils/dateUtils';
import {
  compareWindow,
  type CompareQuestion,
} from '../../src/utils/compareQuestion';

const mockUseCompare = jest.fn();
jest.mock('../../src/hooks/useCompare', () => ({
  useCompare: (...args: unknown[]) => mockUseCompare(...args),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/components/DateRangeSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(() => <View testID="date-range-sheet" />),
  };
});
jest.mock('../../src/components/compare/CompareChart', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="compare-chart" /> };
});

const SUGGESTION: CompareQuestion = {
  a: 'timeAsleep',
  b: 'energy',
  choice: 'sameDay',
};

const okResponse = {
  a: { key: 'timeAsleep', values: {} },
  b: { key: 'energy', values: {} },
  deviations: { a: {}, b: {} },
  result: {
    status: 'ok',
    n: 62,
    needed: 14,
    method: 'pearson',
    linked: true,
    strength: 'moderate',
    sign: 'positive',
    r: 0.31,
    p: 0.012,
    low: 0.1,
    high: 0.5,
    checks: { ownNormal: true },
  },
} as CompareResponse;

const idle = {
  data: undefined,
  isLoading: false,
  isError: false,
  serverTooOld: false,
  refetch: jest.fn(),
};

const renderScreen = () =>
  render(
    <CompareReportScreen
      {...({
        navigation: { navigate: jest.fn(), goBack: jest.fn() },
        route: { params: undefined },
      } as never)}
    />
  );

describe('CompareReportScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
    mockUseCompare.mockReset();
    mockUseCompare.mockReturnValue(idle);
  });

  it('opens on the start state', () => {
    const { getByText, queryByTestId } = renderScreen();
    expect(getByText('Try one of these')).toBeTruthy();
    expect(queryByTestId('compare-chart')).toBeNull();
  });

  it('asks the suggested question over the 90-day day window', () => {
    const { getByTestId, queryByText } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    expect(mockUseCompare).toHaveBeenLastCalledWith(
      SUGGESTION,
      compareWindow('90d', 'day', getTodayDate())
    );
    expect(queryByText('Try one of these')).toBeNull();
  });

  it('switches to the week default when a week choice is picked, keeping each mode span', () => {
    const { getByTestId, getByText } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    fireEvent.press(getByText('30 days'));
    expect(mockUseCompare).toHaveBeenLastCalledWith(
      SUGGESTION,
      compareWindow('30d', 'day', getTodayDate())
    );
    fireEvent.press(screen.getByLabelText(/^When:/));
    fireEvent.press(getByText('The same week'));
    expect(mockUseCompare).toHaveBeenLastCalledWith(
      { ...SUGGESTION, choice: 'sameWeek' },
      compareWindow('6m', 'week', getTodayDate())
    );
    fireEvent.press(screen.getByLabelText(/^When:/));
    fireEvent.press(getByText('The same day'));
    expect(mockUseCompare).toHaveBeenLastCalledWith(
      SUGGESTION,
      compareWindow('30d', 'day', getTodayDate())
    );
  });

  it('shows a spinner while the answer loads', () => {
    mockUseCompare.mockReturnValue({ ...idle, isLoading: true });
    const { getByTestId } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    expect(getByTestId('compare-loading')).toBeTruthy();
  });

  it('renders the answer, chart and checks for an ok response', () => {
    mockUseCompare.mockReturnValue({ ...idle, data: okResponse });
    const { getByTestId, getByText } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    expect(getByText('Yes, a moderate link')).toBeTruthy();
    expect(getByTestId('compare-chart')).toBeTruthy();
    expect(getByText('A link, not proof of cause')).toBeTruthy();
  });

  it('tells the person to update an older server', () => {
    mockUseCompare.mockReturnValue({ ...idle, serverTooOld: true });
    const { getByTestId, getByText, queryByTestId } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    expect(
      getByText(
        'Compare needs a newer SparkyFitness server. Update your server to use it.'
      )
    ).toBeTruthy();
    expect(queryByTestId('compare-chart')).toBeNull();
  });

  it('shows the generic error with a retry', () => {
    const refetch = jest.fn();
    mockUseCompare.mockReturnValue({ ...idle, isError: true, refetch });
    const { getByTestId, getByText } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    fireEvent.press(getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('adds each distinct loaded question to the recents once', () => {
    const add = jest.fn();
    useAppPreferencesStore.setState({ addCompareRecentQuestion: add });
    mockUseCompare.mockReturnValue({ ...idle, data: okResponse });
    const { getByTestId, getByText } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenLastCalledWith(SUGGESTION);

    // A span change refetches the same question and hands back fresh data: no second call.
    mockUseCompare.mockReturnValue({ ...idle, data: { ...okResponse } });
    fireEvent.press(getByText('30 days'));
    expect(add).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText(/^When:/));
    fireEvent.press(getByText('The next day'));
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenLastCalledWith({ ...SUGGESTION, choice: 'nextDay' });
  });

  it('keeps the answer on screen when a refresh fails', () => {
    mockUseCompare.mockReturnValue({
      ...idle,
      data: okResponse,
      isError: true,
    });
    const { getByTestId, getByText, queryByText } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    expect(getByText('Yes, a moderate link')).toBeTruthy();
    expect(getByTestId('compare-chart')).toBeTruthy();
    expect(queryByText("Couldn't load this comparison.")).toBeNull();
  });

  it('skips a stored recent question this build does not know', () => {
    useAppPreferencesStore.setState({
      compareRecentQuestions: [
        { a: 'vo2max', b: 'energy', choice: 'sameDay' },
        { a: 'mood', b: 'energy', choice: 'someday' },
        { a: 'mood', b: 'energy', choice: 'sameDay' },
      ] as unknown as CompareQuestion[],
    });
    const { getByText, getAllByTestId } = renderScreen();
    expect(getByText('Your recent questions')).toBeTruthy();
    expect(getAllByTestId(/^compare-recent-/)).toHaveLength(1);
    expect(getByText('Does mood go with energy the same day?')).toBeTruthy();
  });

  it('does not record a question that has no answer yet', () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    expect(useAppPreferencesStore.getState().compareRecentQuestions).toEqual(
      []
    );
  });
});
