import { describe, expect, it } from 'vitest';
import {
  IMMUNIZATION_DUE_SOON_DAYS,
  immunizationDueStatus,
} from '@workspace/shared';

describe('immunizationDueStatus', () => {
  const today = '2026-11-28';

  it('has nothing due without a date', () => {
    expect(immunizationDueStatus(null, today)).toBe('none');
    expect(immunizationDueStatus(undefined, today)).toBe('none');
  });

  it('calls a past date overdue and today due soon', () => {
    expect(immunizationDueStatus('2026-11-27', today)).toBe('overdue');
    expect(immunizationDueStatus('2026-11-28', today)).toBe('due_soon');
  });

  it('is due soon through the last day of the window, then upcoming', () => {
    expect(IMMUNIZATION_DUE_SOON_DAYS).toBe(30);
    expect(immunizationDueStatus('2026-12-28', today)).toBe('due_soon');
    expect(immunizationDueStatus('2026-12-29', today)).toBe('upcoming');
  });
});
