import type { LabReportScanResult } from '@workspace/shared';
import {
  effectiveLabRange,
  labImportSaveInput,
  planLabImport,
  reportRangeDiffers,
  sameLabUnit,
} from '../../src/utils/labReportImport';
import type { CustomCategory } from '../../src/types/customMeasurements';

const result = (
  overrides: Partial<LabReportScanResult>
): LabReportScanResult => ({
  name: 'Hemoglobin A1c',
  value: 5.4,
  unit: '%',
  ref_low: 4,
  ref_high: 5.6,
  marker_key: 'hba1c',
  ...overrides,
});

const labCategory = (overrides: Partial<CustomCategory>): CustomCategory => ({
  id: 'lab-1',
  name: 'hba1c',
  display_name: 'HbA1c',
  measurement_type: '%',
  frequency: 'All',
  is_lab: true,
  ref_range_low: 4,
  ref_range_high: 5.7,
  ...overrides,
});

describe('sameLabUnit', () => {
  it('ignores case, spacing and micro-sign variants', () => {
    expect(sameLabUnit('mg/dL', 'MG/DL ')).toBe(true);
    expect(sameLabUnit('µIU/mL', 'uIU/mL')).toBe(true);
    expect(sameLabUnit('mg/dL', 'mmol/L')).toBe(false);
  });
});

describe('planLabImport', () => {
  it('saves to the marker the user already has', () => {
    const [row] = planLabImport([result({})], [labCategory({})], null);
    expect(row.target).toMatchObject({
      kind: 'existing',
      category: { id: 'lab-1' },
    });
    expect(row.blocked).toBeNull();
    expect(row.title).toBe('HbA1c');
  });

  it('creates a new marker from the preset with the report range', () => {
    const [row] = planLabImport(
      [
        result({
          marker_key: 'ldl',
          name: 'LDL',
          unit: 'mg/dL',
          ref_low: null,
          ref_high: 99,
        }),
      ],
      [],
      null
    );
    expect(row.target).toMatchObject({
      kind: 'new',
      marker: {
        name: 'ldl',
        display_name: 'LDL Cholesterol',
        measurement_type: 'mg/dL',
        ref_range_low: null,
        ref_range_high: 99,
      },
      defaultRange: { low: null, high: 100 },
    });
    expect(row.blocked).toBeNull();
  });

  it('falls back to the preset range, for the profile sex, when the report prints none', () => {
    const [row] = planLabImport(
      [
        result({
          marker_key: 'hemoglobin',
          name: 'Hemoglobin',
          unit: 'g/dL',
          ref_low: null,
          ref_high: null,
        }),
      ],
      [],
      'female'
    );
    expect(row.target).toMatchObject({
      kind: 'new',
      marker: { ref_range_low: 12, ref_range_high: 15.5 },
    });
  });

  it('makes a custom marker for an unrecognised test, using the report unit', () => {
    const [row] = planLabImport(
      [
        result({
          marker_key: null,
          name: 'Galectin-3',
          unit: 'ng/mL',
          ref_low: null,
          ref_high: 17.8,
        }),
      ],
      [],
      null
    );
    expect(row.target).toMatchObject({
      kind: 'new',
      marker: {
        name: 'Galectin-3',
        measurement_type: 'ng/mL',
        ref_range_high: 17.8,
      },
    });
    expect(row.blocked).toBeNull();
  });

  it('matches a custom marker the user made by its name', () => {
    const custom = labCategory({
      id: 'lab-9',
      name: 'Galectin-3',
      display_name: 'Galectin-3',
      measurement_type: 'ng/mL',
    });
    const [row] = planLabImport(
      [result({ marker_key: null, name: 'galectin-3', unit: 'ng/mL' })],
      [custom],
      null
    );
    expect(row.target).toMatchObject({
      kind: 'existing',
      category: { id: 'lab-9' },
    });
  });

  it('blocks a result in a different unit than the marker uses', () => {
    const [existingRow] = planLabImport(
      [result({ marker_key: 'ldl', name: 'LDL', unit: 'mmol/L' })],
      [labCategory({ id: 'l', name: 'ldl', measurement_type: 'mg/dL' })],
      null
    );
    expect(existingRow.blocked).toBe('unit_mismatch');

    const [newRow] = planLabImport(
      [result({ marker_key: 'ldl', name: 'LDL', unit: 'mmol/L' })],
      [],
      null
    );
    expect(newRow.blocked).toBe('unit_mismatch');
  });

  it('blocks a name that a non-lab measurement already uses', () => {
    const [row] = planLabImport(
      [result({})],
      [labCategory({ is_lab: false, frequency: 'Daily' })],
      null
    );
    expect(row.blocked).toBe('name_taken');
  });

  it('blocks a new marker with no unit, and a repeated marker', () => {
    const [noUnit] = planLabImport(
      [result({ marker_key: null, name: 'Mystery', unit: null })],
      [],
      null
    );
    expect(noUnit.blocked).toBe('no_unit');

    const rows = planLabImport([result({}), result({ value: 5.5 })], [], null);
    expect(rows.map((r) => r.blocked)).toEqual([null, 'duplicate']);
  });
});

describe('ranges on save', () => {
  const [newRow] = planLabImport(
    [
      result({
        marker_key: 'ldl',
        name: 'LDL',
        unit: 'mg/dL',
        ref_low: null,
        ref_high: 99,
      }),
    ],
    [],
    null
  );
  const [existingRow] = planLabImport([result({})], [labCategory({})], null);

  it('uses the report range, or the preset default when told not to', () => {
    expect(effectiveLabRange(newRow, true)).toEqual({ low: null, high: 99 });
    expect(effectiveLabRange(newRow, false)).toEqual({ low: null, high: 100 });
  });

  it('updates an existing marker only when the report range differs', () => {
    expect(reportRangeDiffers(existingRow)).toBe(true);
    expect(
      labImportSaveInput(existingRow, {
        date: '2026-09-20',
        useReportRanges: true,
      })
    ).toMatchObject({
      target: { categoryId: 'lab-1' },
      updateRange: { low: 4, high: 5.6 },
    });
    expect(
      labImportSaveInput(existingRow, {
        date: '2026-09-20',
        useReportRanges: false,
      }).updateRange
    ).toBeUndefined();
  });

  it('builds a new-marker save with the chosen range', () => {
    expect(
      labImportSaveInput(newRow, { date: '2026-09-20', useReportRanges: true })
    ).toMatchObject({
      value: 5.4,
      date: '2026-09-20',
      target: { newMarker: { name: 'ldl', ref_range_high: 99 } },
    });
  });
});
