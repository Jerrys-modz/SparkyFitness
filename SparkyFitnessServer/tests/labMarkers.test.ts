import { describe, expect, it } from 'vitest';
import {
  LAB_MARKER_PRESETS,
  LAB_MARKER_SEX_RANGES,
  hasSexSpecificRange,
  labPresetRange,
  findLabMarkerPreset,
  findLabMarkerPresetByLoinc,
  sameLabUnit,
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

describe('LAB_MARKER_PRESETS names', () => {
  it('keeps aliases lowercase and never shared between two markers', () => {
    const seen = new Map<string, string>();
    for (const p of LAB_MARKER_PRESETS) {
      for (const name of [p.key, p.displayName.toLowerCase(), ...p.aliases]) {
        expect(name).toBe(name.toLowerCase());
        const owner = seen.get(name);
        if (owner !== undefined) expect(owner).toBe(p.key);
        seen.set(name, p.key);
      }
    }
  });
  it('resolves every preset by its own display name', () => {
    for (const p of LAB_MARKER_PRESETS) {
      expect(findLabMarkerPreset(p.displayName)?.key).toBe(p.key);
    }
  });
});

describe('sex-specific ranges', () => {
  const preset = (key: string) =>
    LAB_MARKER_PRESETS.find((p) => p.key === key)!;

  it('only covers real presets, with sane bounds', () => {
    for (const [key, bySex] of Object.entries(LAB_MARKER_SEX_RANGES)) {
      expect(LAB_MARKER_PRESETS.some((p) => p.key === key)).toBe(true);
      for (const { low, high } of Object.values(bySex)) {
        if (low !== null && high !== null)
          expect(low).toBeLessThanOrEqual(high);
      }
    }
  });
  it('uses the profile sex when known', () => {
    expect(labPresetRange(preset('hemoglobin'), 'male')).toEqual({
      low: 13.5,
      high: 17.5,
    });
    expect(labPresetRange(preset('hemoglobin'), 'female')).toEqual({
      low: 12.0,
      high: 15.5,
    });
    expect(labPresetRange(preset('hdl'), 'female')).toEqual({
      low: 50,
      high: null,
    });
  });
  it('falls back to the sex-neutral default when sex is unknown', () => {
    expect(labPresetRange(preset('hemoglobin'), null)).toEqual({
      low: 12.0,
      high: 17.5,
    });
    expect(labPresetRange(preset('testosterone'), undefined)).toEqual({
      low: null,
      high: null,
    });
  });
  it('leaves sex-neutral markers alone', () => {
    expect(hasSexSpecificRange(preset('hba1c'))).toBe(false);
    expect(labPresetRange(preset('hba1c'), 'female')).toEqual({
      low: 4,
      high: 5.6,
    });
  });
});

describe('LOINC codes', () => {
  it('gives every built-in marker at least one well-formed code', () => {
    for (const preset of LAB_MARKER_PRESETS) {
      expect(preset.loinc.length, preset.key).toBeGreaterThan(0);
      for (const code of preset.loinc) {
        expect(code, preset.key).toMatch(/^\d{1,7}-\d$/);
      }
    }
  });

  it('never gives one code to two markers', () => {
    const seen = new Map<string, string>();
    for (const preset of LAB_MARKER_PRESETS) {
      for (const code of preset.loinc) {
        expect(seen.get(code), `${code} in ${preset.key}`).toBeUndefined();
        seen.set(code, preset.key);
      }
    }
  });

  it('has valid check digits (LOINC mod 10)', () => {
    // LOINC check digit: Luhn-style mod 10 over the part before the dash.
    const checkDigit = (body: string): number => {
      let sum = 0;
      const digits = body.split('').reverse().map(Number);
      digits.forEach((d, i) => {
        if (i % 2 === 0) {
          const doubled = d * 2;
          sum += doubled > 9 ? doubled - 9 : doubled;
        } else {
          sum += d;
        }
      });
      return (10 - (sum % 10)) % 10;
    };
    for (const preset of LAB_MARKER_PRESETS) {
      for (const code of preset.loinc) {
        const [body, check] = code.split('-');
        expect(checkDigit(body ?? ''), `${code} in ${preset.key}`).toBe(
          Number(check)
        );
      }
    }
  });

  it('finds a marker by any of its codes', () => {
    expect(findLabMarkerPresetByLoinc('4548-4')?.key).toBe('hba1c');
    expect(findLabMarkerPresetByLoinc('17856-6')?.key).toBe('hba1c');
    expect(findLabMarkerPresetByLoinc(' 13457-7 ')?.key).toBe('ldl');
    expect(findLabMarkerPresetByLoinc('62292-8')?.key).toBe('vitamin_d');
  });

  it('does not map plain serum glucose to fasting glucose', () => {
    expect(findLabMarkerPresetByLoinc('1558-6')?.key).toBe('fasting_glucose');
    expect(findLabMarkerPresetByLoinc('2345-7')).toBeUndefined();
  });

  it('returns undefined for an unknown code', () => {
    expect(findLabMarkerPresetByLoinc('99999-9')).toBeUndefined();
  });
});

describe('UCUM unit spellings', () => {
  it('treats the FHIR spellings as the same unit as the printed ones', () => {
    expect(sameLabUnit('10*3/uL', '10³/µL')).toBe(true);
    expect(sameLabUnit('10*6/uL', '10⁶/µL')).toBe(true);
    expect(sameLabUnit('[IU]/L', 'U/L')).toBe(true);
    expect(sameLabUnit('u[IU]/mL', 'µIU/mL')).toBe(true);
    expect(sameLabUnit('m[IU]/L', 'mIU/L')).toBe(true);
    expect(sameLabUnit('m[IU]/mL', 'mIU/mL')).toBe(true);
    expect(sameLabUnit('mL/min/{1.73_m2}', 'mL/min/1.73m²')).toBe(true);
    expect(sameLabUnit('mm/h', 'mm/hr')).toBe(true);
  });

  it('still keeps different units apart', () => {
    expect(sameLabUnit('10*3/uL', '10*6/uL')).toBe(false);
    expect(sameLabUnit('mm/h', 'mm')).toBe(false);
  });
});
