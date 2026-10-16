import { LAB_MARKER_PRESETS } from '@workspace/shared';
import {
  buildLabPickerOptions,
  formatLabRange,
  formatLabValue,
  labHistoryPoints,
  labSexFromGender,
  labStatus,
  newLabMarkerFromPreset,
  parseLabValue,
  parseRangeBound,
} from '../../src/utils/labResults';
import type {
  CustomCategory,
  CustomMeasurementEntry,
} from '../../src/types/customMeasurements';

const category = (overrides: Partial<CustomCategory>): CustomCategory => ({
  id: 'cat-1',
  name: 'weight_note',
  measurement_type: 'kg',
  frequency: 'Daily',
  ...overrides,
});

describe('parseLabValue', () => {
  it('parses numbers and decimal commas', () => {
    expect(parseLabValue('5.4')).toBe(5.4);
    expect(parseLabValue(' 5,4 ')).toBe(5.4);
    expect(parseLabValue('0')).toBe(0);
  });
  it('rejects empty, negative and non-numeric input', () => {
    expect(parseLabValue('')).toBeNull();
    expect(parseLabValue('abc')).toBeNull();
    expect(parseLabValue('-1')).toBeNull();
  });
});

describe('parseRangeBound', () => {
  it('treats empty as no bound and junk as invalid', () => {
    expect(parseRangeBound('')).toEqual({ ok: true, value: null });
    expect(parseRangeBound('4.5')).toEqual({ ok: true, value: 4.5 });
    expect(parseRangeBound('x')).toEqual({ ok: false });
  });
});

describe('labStatus and formatting', () => {
  it('compares against the category range', () => {
    const cat = { ref_range_low: 4, ref_range_high: 5.6 };
    expect(labStatus(cat, 5.2)).toBe('in_range');
    expect(labStatus(cat, 6)).toBe('high');
    expect(labStatus(cat, 3)).toBe('low');
    expect(labStatus({}, 3)).toBe('unknown');
  });
  it('formats ranges and values', () => {
    expect(formatLabRange(4, 5.6, '%')).toBe('4 - 5.6 %');
    expect(formatLabRange(null, 200, 'mg/dL')).toBe('< 200 mg/dL');
    expect(formatLabRange(40, null, 'mg/dL')).toBe('> 40 mg/dL');
    expect(formatLabRange(null, null, '%')).toBeNull();
    expect(formatLabValue(5.4, '%')).toBe('5.4 %');
    expect(formatLabValue(5.4, '')).toBe('5.4');
  });
});

describe('labHistoryPoints', () => {
  it('sorts oldest first and drops non-numeric rows', () => {
    const entries = [
      { id: '1', category_id: 'c', value: '5.6', entry_date: '2025-03-01' },
      { id: '2', category_id: 'c', value: 'n/a', entry_date: '2025-02-01' },
      {
        id: '3',
        category_id: 'c',
        value: '5.2',
        entry_date: '2024-11-01T00:00:00.000Z',
      },
    ] as CustomMeasurementEntry[];
    expect(labHistoryPoints(entries)).toEqual([
      { day: '2024-11-01', value: 5.2 },
      { day: '2025-03-01', value: 5.6 },
    ]);
  });
});

describe('labHistoryPoints with rows that have no entry_date', () => {
  it('skips them instead of throwing', () => {
    const rows = [
      { category_id: 'c', value: '5.4', date: '2025-03-01' },
      { id: '2', category_id: 'c', value: '5.5', entry_date: '2025-04-01' },
    ] as unknown as CustomMeasurementEntry[];
    expect(labHistoryPoints(rows)).toEqual([{ day: '2025-04-01', value: 5.5 }]);
  });
});

describe('buildLabPickerOptions', () => {
  const hba1c = category({
    id: 'lab-1',
    name: 'hba1c',
    display_name: 'HbA1c',
    measurement_type: '%',
    is_lab: true,
  });

  it('lists the user markers first, then presets not yet created', () => {
    const options = buildLabPickerOptions([hba1c], '');
    expect(options[0]).toMatchObject({ kind: 'existing' });
    expect(options.filter((o) => o.kind === 'existing')).toHaveLength(1);
    const presets = options.filter((o) => o.kind === 'preset');
    expect(presets).toHaveLength(LAB_MARKER_PRESETS.length - 1);
    expect(
      presets.some((o) => o.kind === 'preset' && o.preset.key === 'hba1c')
    ).toBe(false);
  });
  it('searches display names and aliases', () => {
    const options = buildLabPickerOptions([], 'hemoglobin a1c');
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      kind: 'preset',
      preset: { key: 'hba1c' },
    });
  });
  it('ignores categories that are not lab markers', () => {
    const options = buildLabPickerOptions([category({ name: 'mood' })], '');
    expect(options.every((o) => o.kind === 'preset')).toBe(true);
  });
});

describe('newLabMarkerFromPreset', () => {
  it('carries the preset unit and range', () => {
    const preset = LAB_MARKER_PRESETS.find((p) => p.key === 'ldl')!;
    expect(newLabMarkerFromPreset(preset)).toEqual({
      name: 'ldl',
      display_name: 'LDL Cholesterol',
      measurement_type: 'mg/dL',
      ref_range_low: null,
      ref_range_high: 100,
    });
  });
});

describe('sex-aware presets', () => {
  const hemoglobin = LAB_MARKER_PRESETS.find((p) => p.key === 'hemoglobin')!;

  it('uses the profile sex for the prefilled range', () => {
    expect(newLabMarkerFromPreset(hemoglobin, 'female')).toMatchObject({
      ref_range_low: 12,
      ref_range_high: 15.5,
    });
    expect(newLabMarkerFromPreset(hemoglobin, 'male')).toMatchObject({
      ref_range_low: 13.5,
      ref_range_high: 17.5,
    });
  });
  it('falls back to the neutral default with no known sex', () => {
    expect(newLabMarkerFromPreset(hemoglobin)).toMatchObject({
      ref_range_low: 12,
      ref_range_high: 17.5,
    });
  });
  it('only recognises male and female profile genders', () => {
    expect(labSexFromGender('male')).toBe('male');
    expect(labSexFromGender('female')).toBe('female');
    expect(labSexFromGender('other')).toBeNull();
    expect(labSexFromGender(null)).toBeNull();
  });
});
