import type { OnDeviceSupplementExtraction } from '../../modules/on-device-nutrition';

jest.mock('../../modules/on-device-nutrition', () => ({
  __esModule: true,
  default: {
    isAvailable: jest.fn(),
    scanLabel: jest.fn(),
    scanSupplementLabel: jest.fn(),
  },
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

import mockModuleImport from '../../modules/on-device-nutrition';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import {
  groundSupplementLabel,
  scanSupplementLabelOnDevice,
} from '../../src/services/onDeviceSupplementScan';

const mockModule = jest.mocked(mockModuleImport!);

const OCR = [
  'Supplement Facts',
  'Serving Size 2 Capsules',
  'Vitamin C 90 mg 100%',
  'Zinc 15 mg 136%',
  'Calcium 1,000 mg 77%',
].join('\n');

const extraction = (
  over: Partial<OnDeviceSupplementExtraction> = {}
): OnDeviceSupplementExtraction => ({
  name: 'Daily Multi',
  brand: 'Acme',
  form: 'Capsule',
  serving: '2 Capsules',
  ingredients: [
    { name: 'Vitamin C', amount: 90, unit: 'mg' },
    { name: 'Zinc', amount: 15, unit: 'mg' },
  ],
  ocr_text: OCR,
  ...over,
});

describe('groundSupplementLabel', () => {
  it('keeps lines whose name and amount are printed', () => {
    const label = groundSupplementLabel(extraction());

    expect(label).toEqual({
      name: 'Daily Multi',
      brand: 'Acme',
      form: 'capsule',
      serving: '2 Capsules',
      ingredients: [
        { name: 'Vitamin C', amount: 90, unit: 'mg' },
        { name: 'Zinc', amount: 15, unit: 'mg' },
      ],
    });
  });

  it('reads a thousands separator', () => {
    const label = groundSupplementLabel(
      extraction({
        ingredients: [{ name: 'Calcium', amount: 1000, unit: 'mg' }],
      })
    );
    expect(label?.ingredients).toHaveLength(1);
  });

  it('falls back when there is no recognised text to check against', () => {
    expect(groundSupplementLabel(extraction({ ocr_text: '' }))).toBeNull();
  });

  it('falls back when an invented amount is not on the label', () => {
    expect(
      groundSupplementLabel(
        extraction({
          ingredients: [
            { name: 'Vitamin C', amount: 90, unit: 'mg' },
            { name: 'Zinc', amount: 40, unit: 'mg' },
          ],
        })
      )
    ).toBeNull();
  });

  it('drops one ungrounded line when most of the label checks out', () => {
    const label = groundSupplementLabel(
      extraction({
        ingredients: [
          { name: 'Vitamin C', amount: 90, unit: 'mg' },
          { name: 'Zinc', amount: 15, unit: 'mg' },
          { name: 'Calcium', amount: 1000, unit: 'mg' },
          { name: 'Magnesium', amount: 400, unit: 'mg' },
        ],
      })
    );
    expect(label?.ingredients.map((i) => i.name)).toEqual([
      'Vitamin C',
      'Zinc',
      'Calcium',
    ]);
  });

  it('drops a form the app does not offer', () => {
    expect(
      groundSupplementLabel(extraction({ form: 'lozenge' }))?.form
    ).toBeNull();
  });
});

describe('scanSupplementLabelOnDevice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppPreferencesStore.setState({ onDeviceLabelScanEnabled: true });
    mockModule.isAvailable.mockReturnValue(true);
  });

  it('is skipped while the on-device setting is off', async () => {
    useAppPreferencesStore.setState({ onDeviceLabelScanEnabled: false });

    expect(await scanSupplementLabelOnDevice('abc')).toBeNull();
    expect(mockModule.scanSupplementLabel).not.toHaveBeenCalled();
  });

  it('is skipped when Apple Intelligence is unavailable', async () => {
    mockModule.isAvailable.mockReturnValue(false);

    expect(await scanSupplementLabelOnDevice('abc')).toBeNull();
  });

  it('returns the grounded reading', async () => {
    mockModule.scanSupplementLabel.mockResolvedValue(extraction());

    const label = await scanSupplementLabelOnDevice('abc');

    expect(label?.ingredients).toHaveLength(2);
  });

  it('falls back when the model throws', async () => {
    mockModule.scanSupplementLabel.mockRejectedValue(new Error('boom'));

    expect(await scanSupplementLabelOnDevice('abc')).toBeNull();
  });
});
