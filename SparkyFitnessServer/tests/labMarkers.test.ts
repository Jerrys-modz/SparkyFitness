import { describe, expect, it } from 'vitest';
import {
  LAB_MARKER_PRESETS,
  findLabMarkerPreset,
  labRangeStatus,
} from '@workspace/shared';

describe('labRangeStatus', () => {
  it('classifies against a closed range', () => {
    expect(labRangeStatus(5.2, 4, 5.6)).toBe('in_range');
    expect(labRangeStatus(3.9, 4, 5.6)).toBe('low');
    expect(labRangeStatus(6.1, 4, 5.6)).toBe('high');
  });
  it('treats a missing bound as open-ended', () => {
    expect(labRangeStatus(500, null, 200)).toBe('high');
    expect(labRangeStatus(0, null, 200)).toBe('in_range');
    expect(labRangeStatus(35, 40, null)).toBe('low');
  });
  it('is unknown with no range', () => {
    expect(labRangeStatus(1, null, null)).toBe('unknown');
  });
});

describe('findLabMarkerPreset', () => {
  it('matches display names, keys and aliases case-insensitively', () => {
    expect(findLabMarkerPreset('Hemoglobin A1c')?.key).toBe('hba1c');
    expect(findLabMarkerPreset(' LDL-C ')?.key).toBe('ldl');
    expect(findLabMarkerPreset('vitamin_d')?.key).toBe('vitamin_d');
  });
  it('returns undefined for unknown markers', () => {
    expect(findLabMarkerPreset('not a marker')).toBeUndefined();
  });
  it('has unique keys and sane ranges', () => {
    const keys = LAB_MARKER_PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of LAB_MARKER_PRESETS) {
      if (p.refRangeLow !== null && p.refRangeHigh !== null) {
        expect(p.refRangeLow).toBeLessThanOrEqual(p.refRangeHigh);
      }
    }
  });
});
