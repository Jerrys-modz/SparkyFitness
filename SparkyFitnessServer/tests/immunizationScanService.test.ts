import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/documentScanService.js', () => ({
  extractDocumentJson: vi.fn(),
}));

import { extractDocumentJson } from '../services/documentScanService.js';
import {
  extractImmunizations,
  flagAlreadyRecorded,
  normalizeImmunizations,
} from '../services/immunizationScanService.js';

describe('normalizeImmunizations', () => {
  it('keeps a complete record and nulls loose optional values', () => {
    expect(
      normalizeImmunizations({
        records: [
          {
            vaccine_name: ' Influenza ',
            administered_on: '2026-10-01',
            dose_number: '2',
            lot_number: '',
            administered_by: 'Walgreens',
            site: null,
          },
        ],
      })
    ).toEqual({
      records: [
        {
          vaccine_name: 'Influenza',
          administered_on: '2026-10-01',
          dose_number: 2,
          lot_number: null,
          administered_by: 'Walgreens',
          site: null,
        },
      ],
    });
  });

  it('drops entries without a name or a real date', () => {
    const result = normalizeImmunizations({
      records: [
        { vaccine_name: 'Tdap', administered_on: null },
        { vaccine_name: 'MMR', administered_on: '2026-02-31' },
        { vaccine_name: '', administered_on: '2026-01-01' },
        { vaccine_name: 'Hep B', administered_on: '2026-01-01' },
      ],
    });
    expect(result?.records.map((r) => r.vaccine_name)).toEqual(['Hep B']);
  });

  it('ignores an out-of-range dose number instead of failing the record', () => {
    const result = normalizeImmunizations({
      records: [
        {
          vaccine_name: 'Tdap',
          administered_on: '2026-01-01',
          dose_number: 99,
        },
      ],
    });
    expect(result?.records[0]?.dose_number).toBeNull();
  });

  it('returns null when nothing usable is left', () => {
    expect(normalizeImmunizations({ records: [] })).toBeNull();
    expect(normalizeImmunizations('nope')).toBeNull();
    expect(normalizeImmunizations(null)).toBeNull();
  });
});

describe('flagAlreadyRecorded', () => {
  it('flags the same vaccine on the same day, ignoring case', () => {
    const flagged = flagAlreadyRecorded(
      {
        records: [
          {
            vaccine_name: 'Influenza',
            administered_on: '2026-10-01',
            dose_number: null,
            lot_number: null,
            administered_by: null,
            site: null,
          },
          {
            vaccine_name: 'Influenza',
            administered_on: '2025-10-01',
            dose_number: null,
            lot_number: null,
            administered_by: null,
            site: null,
          },
        ],
      },
      [{ vaccine_name: 'influenza', administered_on: '2026-10-01' }]
    );
    expect(flagged.map((r) => r.already_recorded)).toEqual([true, false]);
  });
});

describe('extractImmunizations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks the shared reader with the vaccine prompt and shapes its JSON', async () => {
    vi.mocked(extractDocumentJson).mockResolvedValue({
      success: true,
      json: {
        records: [{ vaccine_name: 'Tdap', administered_on: '2026-05-04' }],
      },
    });
    const result = await extractImmunizations('b64', 'application/pdf', 'u1');
    expect(result.success).toBe(true);
    const options = vi.mocked(extractDocumentJson).mock.calls[0]?.[0];
    expect(options?.prompt).toContain('vaccine');
    expect(options?.logLabel).toBe('Immunization scan');
  });

  it('passes a reader failure through unchanged', async () => {
    vi.mocked(extractDocumentJson).mockResolvedValue({
      success: false,
      category: 'no_ai_configured',
      error: 'No AI service configured',
    });
    expect(await extractImmunizations('b64', 'application/pdf', 'u1')).toEqual({
      success: false,
      category: 'no_ai_configured',
      error: 'No AI service configured',
    });
  });

  it('reports a parse error when no vaccine can be read', async () => {
    vi.mocked(extractDocumentJson).mockResolvedValue({
      success: true,
      json: { records: [] },
    });
    const result = await extractImmunizations('b64', 'image/jpeg', 'u1');
    expect(result).toMatchObject({ success: false, category: 'parse_error' });
  });
});
