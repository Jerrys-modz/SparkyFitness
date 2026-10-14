import type { TFunction } from 'i18next';
import { sharedTextKey } from '@workspace/shared';
import { sharedText } from '@/utils/sharedText';

const translateWith = (catalog: Record<string, string>) =>
  ((key: string, fallback: string) =>
    catalog[key] ?? fallback) as unknown as TFunction;

describe('sharedText', () => {
  it('uses the catalog entry stored under the key derived from the text', () => {
    const t = translateWith({
      [`sharedText.${sharedTextKey('Egg-white')}`]: 'Eiweiß',
    });
    expect(sharedText(t, 'Egg-white')).toBe('Eiweiß');
  });

  it('returns text without an entry, such as one the user typed, unchanged', () => {
    expect(sharedText(translateWith({}), 'My own product')).toBe(
      'My own product'
    );
  });

  it('leaves empty text alone', () => {
    expect(sharedText(translateWith({}), '')).toBe('');
  });
});

describe('sharedTextKey', () => {
  it('is stable and keeps different wording apart', () => {
    expect(sharedTextKey('Hot flashes')).toBe(sharedTextKey('Hot flashes'));
    expect(sharedTextKey('Hot flashes')).not.toBe(sharedTextKey('Hot Flashes'));
    expect(sharedTextKey('Hot flashes')).toMatch(/^hotFlashes_[0-9a-z]+$/);
  });
});
