import React from 'react';
import { Alert } from 'react-native';
import { render } from '@testing-library/react-native';
import LabResultsScreen from '../../src/screens/LabResultsScreen';
import {
  useDeleteImportedLabResults,
  useLabMarkers,
  useLatestLabValues,
} from '../../src/hooks/useLabResults';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../../src/components/Icon', () => 'Icon');
const mockHeaderConfigs: { right: unknown }[] = [];
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: (config: { right: unknown }) => {
    mockHeaderConfigs.push(config);
    return null;
  },
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/hooks/useLabResults', () => ({
  useDeleteImportedLabResults: jest.fn(),
  useLabMarkers: jest.fn(),
  useLatestLabValues: jest.fn(),
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as never;
const route = { params: undefined } as never;
const mutate = jest.fn();

describe('LabResultsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHeaderConfigs.length = 0;
    jest.mocked(useLabMarkers).mockReturnValue({
      markers: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as never);
    jest.mocked(useLatestLabValues).mockReturnValue({
      byCategory: new Map(),
      refetch: jest.fn(),
    } as never);
    jest
      .mocked(useDeleteImportedLabResults)
      .mockReturnValue({ mutate } as never);
  });

  it('deletes the imported results from the header menu after confirming', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<LabResultsScreen navigation={navigation} route={route} />);

    const right = mockHeaderConfigs[mockHeaderConfigs.length - 1].right as {
      kind: string;
      items?: { label: string; onPress: () => void }[];
    }[];
    const menu = right.find((item) => item.kind === 'menu')!;
    expect(menu.items![0].label).toBe('Delete imported results');

    menu.items![0].onPress();
    expect(mutate).not.toHaveBeenCalled(); // not until confirmed

    const buttons = alert.mock.calls[0][2]!;
    buttons.find((b) => b.style === 'destructive')!.onPress!();
    expect(mutate).toHaveBeenCalled();
  });
});
