import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import ImmunizationImportScreen from '../../src/screens/ImmunizationImportScreen';
import {
  useImportImmunizations,
  useScanImmunizations,
} from '../../src/hooks/useImmunizations';
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
jest.mock('../../src/components/FormScreenChrome', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    FooterSaveBar: ({
      onPress,
      disabled,
      label,
    }: {
      onPress: () => void;
      disabled?: boolean;
      label?: string;
    }) => (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
      >
        <Text>{label ?? 'save'}</Text>
      </Pressable>
    ),
  };
});
jest.mock('../../src/hooks/useImmunizations', () => ({
  useScanImmunizations: jest.fn(),
  useImportImmunizations: jest.fn(),
}));
jest.mock('../../src/services/labReportPicker', () => ({
  pickLabReportPdf: jest.fn(),
  pickLabReportFromLibrary: jest.fn(),
  pickLabReportFromCamera: jest.fn(),
}));

const goBack = jest.fn();
const navigation = { goBack, navigate: jest.fn() } as never;
const route = { params: undefined } as never;
const scanAsync = jest.fn();
const importAsync = jest.fn();

const record = (over: Record<string, unknown> = {}) => ({
  vaccine_name: 'Influenza',
  administered_on: '2026-10-01',
  dose_number: null,
  lot_number: null,
  administered_by: 'Walgreens',
  site: null,
  already_recorded: false,
  ...over,
});

const pickPdf = async (screen: ReturnType<typeof render>) => {
  jest.mocked(pickLabReportPdf).mockResolvedValue({
    status: 'ok',
    document: 'b64',
    mimeType: 'application/pdf',
  });
  fireEvent.press(screen.getByText('Choose a PDF'));
};

describe('ImmunizationImportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useScanImmunizations).mockReturnValue({
      mutateAsync: scanAsync,
      isPending: false,
      isError: false,
      error: null,
      reset: jest.fn(),
    } as never);
    jest.mocked(useImportImmunizations).mockReturnValue({
      mutateAsync: importAsync,
      isPending: false,
    } as never);
  });

  it('offers a PDF, a photo and the camera before anything is read', () => {
    const screen = render(
      <ImmunizationImportScreen navigation={navigation} route={route} />
    );
    expect(screen.getByText('Choose a PDF')).toBeTruthy();
    expect(screen.getByText('Choose a photo or screenshot')).toBeTruthy();
    expect(screen.getByText('Take a photo')).toBeTruthy();
  });

  it('scans the picked file, starts a vaccine already recorded off, and saves only the rest', async () => {
    scanAsync.mockResolvedValue({
      records: [
        record({ already_recorded: true }),
        record({ vaccine_name: 'Tdap', administered_on: '2026-05-04' }),
      ],
    });
    importAsync.mockResolvedValue({ created: 1 });
    const screen = render(
      <ImmunizationImportScreen navigation={navigation} route={route} />
    );
    await pickPdf(screen);
    await waitFor(() => expect(screen.getByText('Tdap')).toBeTruthy());
    expect(scanAsync).toHaveBeenCalledWith({
      document: 'b64',
      mimeType: 'application/pdf',
    });
    expect(screen.getByText('Already recorded')).toBeTruthy();
    fireEvent.press(screen.getByText('Save 1 immunization'));
    await waitFor(() => expect(importAsync).toHaveBeenCalled());
    expect(importAsync.mock.calls[0][0]).toEqual({
      records: [
        {
          vaccine_name: 'Tdap',
          administered_on: '2026-05-04',
          dose_number: null,
          lot_number: null,
          administered_by: 'Walgreens',
          site: null,
        },
      ],
    });
    expect(goBack).toHaveBeenCalled();
  });

  it('says nothing was saved when the save fails, and stays on the review', async () => {
    scanAsync.mockResolvedValue({ records: [record()] });
    importAsync.mockRejectedValue(new Error('boom'));
    const screen = render(
      <ImmunizationImportScreen navigation={navigation} route={route} />
    );
    await pickPdf(screen);
    await waitFor(() => expect(screen.getByText('Influenza')).toBeTruthy());
    fireEvent.press(screen.getByText('Save 1 immunization'));
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    );
    expect(goBack).not.toHaveBeenCalled();
  });

  it('shows why a file could not be opened', async () => {
    jest.mocked(pickLabReportPdf).mockResolvedValue({ status: 'too_large' });
    const screen = render(
      <ImmunizationImportScreen navigation={navigation} route={route} />
    );
    fireEvent.press(screen.getByText('Choose a PDF'));
    await waitFor(() =>
      expect(
        screen.getByText('That PDF is too large to read (limit 14 MB).')
      ).toBeTruthy()
    );
    expect(scanAsync).not.toHaveBeenCalled();
  });
});
