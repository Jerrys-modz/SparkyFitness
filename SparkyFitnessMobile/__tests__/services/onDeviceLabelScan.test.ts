import type { OnDeviceLabelExtraction } from '../../modules/on-device-nutrition';

jest.mock('../../modules/on-device-nutrition', () => ({
  __esModule: true,
  default: { isAvailable: jest.fn(), scanLabel: jest.fn() },
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

import mockModuleImport from '../../modules/on-device-nutrition';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import {
  isGroundedInLabelText,
  isPlausibleLabel,
  scanLabelOnDevice,
  toLabelScanResult,
} from '../../src/services/onDeviceLabelScan';

const mockModule = jest.mocked(mockModuleImport!);

const label = (over: Partial<OnDeviceLabelExtraction> = {}) =>
  ({
    name: 'Granola',
    brand: 'Acme',
    serving_size: 40,
    serving_unit: 'g',
    calories: 180,
    protein: 4,
    carbs: 26,
    fat: 7,
    fiber: 3,
    saturated_fat: 1,
    trans_fat: 0,
    sodium: 90,
    sugars: 8,
    cholesterol: 0,
    potassium: 120,
    calcium: 20,
    iron: 1,
    values_are_per_100: false,
    ...over,
  }) as OnDeviceLabelExtraction;

describe('onDeviceLabelScan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockModule.isAvailable.mockReturnValue(true);
    useAppPreferencesStore.setState({ onDeviceLabelScanEnabled: true });
  });

  it('accepts a coherent label', () => {
    expect(isPlausibleLabel(label())).toBe(true);
  });

  it.each([
    ['missing calories', { calories: null }],
    ['sugars above carbs', { sugars: 40 }],
    ['saturated fat above fat', { saturated_fat: 20 }],
    ['negative value', { protein: -1 }],
    ['energy far from macros', { calories: 900 }],
  ])('rejects %s', (_name, over) => {
    expect(isPlausibleLabel(label(over))).toBe(false);
  });

  it('accepts values printed in the label text', () => {
    const r = label({
      ocr_text: 'Calories 180\nProtein 4g\nTotal Carbohydrate 26,0g\nFat 7g',
    });
    expect(isGroundedInLabelText(r)).toBe(true);
  });

  it('rejects a macro that is not in the label text', () => {
    const r = label({
      ocr_text: 'Calories 180\nProtein 5g\nCarbs 26g\nFat 7g',
    });
    expect(isGroundedInLabelText(r)).toBe(false);
  });

  it('skips the text check when nothing was recognised', () => {
    expect(isGroundedInLabelText(label({ ocr_text: '' }))).toBe(true);
    expect(isGroundedInLabelText(label())).toBe(true);
  });

  it('maps per-100 labels to a 100 g serving', () => {
    const r = toLabelScanResult(
      label({ values_are_per_100: true, serving_size: 40 })
    );
    expect(r.serving_size).toBe(100);
    expect(r.serving_unit).toBe('g');
  });

  it('returns the mapped result when the model output is valid', async () => {
    mockModule.scanLabel.mockResolvedValue(label());
    const r = await scanLabelOnDevice('b64');
    expect(r?.calories).toBe(180);
    expect(r?.vitamin_c).toBeNull();
  });

  it('returns null when unavailable, throwing, or implausible', async () => {
    mockModule.isAvailable.mockReturnValue(false);
    expect(await scanLabelOnDevice('b64')).toBeNull();
    expect(mockModule.scanLabel).not.toHaveBeenCalled();

    mockModule.isAvailable.mockReturnValue(true);
    mockModule.scanLabel.mockRejectedValue(new Error('boom'));
    expect(await scanLabelOnDevice('b64')).toBeNull();

    mockModule.scanLabel.mockResolvedValue(label({ calories: 900 }));
    expect(await scanLabelOnDevice('b64')).toBeNull();
  });

  it('skips the on-device model when the setting is off', async () => {
    useAppPreferencesStore.setState({ onDeviceLabelScanEnabled: false });
    mockModule.scanLabel.mockResolvedValue(label());
    expect(await scanLabelOnDevice('b64')).toBeNull();
    expect(mockModule.scanLabel).not.toHaveBeenCalled();
  });
});
