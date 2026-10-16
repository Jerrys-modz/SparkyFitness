import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import LabReportImportScreen from '../../src/screens/LabReportImportScreen';
import {
  useImportLabResults,
  useScanLabReport,
} from '../../src/hooks/useLabReportImport';
import { pickLabReportPdf } from '../../src/services/labReportPicker';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/components/CalendarSheet', () => 'CalendarSheet');
jest.mock('../../src/components/FormScreenChrome', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    FooterSaveBar: ({
      onPress,
      disabled,
    }: {
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
      >
        <Text>save-bar</Text>
      </Pressable>
    ),
  };
});
jest.mock('../../src/hooks/useCustomMeasurements', () => ({
  useCustomCategories: () => ({ data: [] }),
}));
jest.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { gender: 'male' } }),
}));
jest.mock('../../src/hooks/useLabReportImport', () => ({
  useScanLabReport: jest.fn(),
  useImportLabResults: jest.fn(),
}));
jest.mock('../../src/services/labReportPicker', () => ({
  pickLabReportPdf: jest.fn(),
  pickLabReportFromLibrary: jest.fn(),
  pickLabReportFromCamera: jest.fn(),
}));

const scanned = {
  report: {
    lab_name: 'Labcorp',
    collected_on: '2026-09-12',
    results: [
      {
        name: 'LDL',
        value: 130,
        unit: 'mg/dL',
        ref_low: null,
        ref_high: 99,
        marker_key: 'ldl',
      },
      {
        name: 'TSH',
        value: 1.69,
        unit: 'uIU/mL',
        ref_low: 0.45,
        ref_high: 4.5,
        marker_key: 'tsh',
      },
    ],
  },
};

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as never;
const route = { params: undefined } as never;
const importAsync = jest.fn();

describe('LabReportImportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useScanLabReport).mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue(scanned),
      isPending: false,
      isError: false,
      reset: jest.fn(),
    } as never);
    importAsync.mockResolvedValue({ saved: 2, failed: [] });
    jest.mocked(useImportLabResults).mockReturnValue({
      mutateAsync: importAsync,
      isPending: false,
    } as never);
    jest.mocked(pickLabReportPdf).mockResolvedValue({
      status: 'ok',
      document: 'AAA',
      mimeType: 'application/pdf',
    });
  });

  const openReview = async () => {
    const utils = render(
      <LabReportImportScreen navigation={navigation} route={route} />
    );
    fireEvent.press(utils.getByText('Choose a PDF'));
    await waitFor(() => expect(utils.getByText('Date of test')).toBeTruthy());
    return utils;
  };

  it('does not block a TSH printed in uIU/mL', async () => {
    const { queryByText } = await openReview();
    expect(queryByText(/Units are not converted/)).toBeNull();
  });

  it('saves a value the user corrected, not the scanned one', async () => {
    const { getByLabelText, getByText } = await openReview();

    fireEvent.changeText(getByLabelText('Result for LDL Cholesterol'), '97');
    fireEvent.press(getByText('save-bar'));

    await waitFor(() => expect(importAsync).toHaveBeenCalled());
    const rows = importAsync.mock.calls[0][0];
    expect(
      rows.find((r: { name: string }) => r.name === 'LDL Cholesterol').input
        .value
    ).toBe(97);
    expect(
      rows.find((r: { name: string }) => r.name === 'TSH').input.value
    ).toBe(1.69);
  });

  it('leaves out a row whose edited value is not a number', async () => {
    const { getByLabelText, getByText } = await openReview();

    fireEvent.changeText(getByLabelText('Result for LDL Cholesterol'), 'abc');
    fireEvent.press(getByText('save-bar'));

    await waitFor(() => expect(importAsync).toHaveBeenCalled());
    const names = importAsync.mock.calls[0][0].map(
      (r: { name: string }) => r.name
    );
    expect(names).toEqual(['TSH']);
  });
});
