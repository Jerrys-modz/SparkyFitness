import {
  MAX_WIDGET_LAYOUTS,
  WIDGET_FAMILY_MAX_METRICS,
  defaultStyleForFamily,
  normalizeWidgetLayout,
  parseStoredWidgetLayouts,
  type WidgetLayoutInput,
} from '@workspace/shared';

const base: WidgetLayoutInput = {
  id: 'a',
  name: 'Morning',
  family: 'medium',
  style: 'grid',
  metrics: [{ metric: 'protein' }, { metric: 'carbs' }],
};

describe('normalizeWidgetLayout', () => {
  it('fills defaults', () => {
    const layout = normalizeWidgetLayout(base);
    expect(layout.accent).toBe('blue');
    expect(layout.showTitle).toBe(true);
    expect(layout.standByFriendly).toBe(false);
    expect(layout.version).toBe(1);
  });

  it('falls back to the family default when the style does not fit', () => {
    const layout = normalizeWidgetLayout({
      ...base,
      family: 'lockInline',
      style: 'grid',
    });
    expect(layout.style).toBe(defaultStyleForFamily('lockInline'));
    expect(layout.style).toBe('value');
  });

  it('drops repeated metrics and keeps the first', () => {
    const layout = normalizeWidgetLayout({
      ...base,
      metrics: [
        { metric: 'water', label: 'Drinks' },
        { metric: 'water' },
        { metric: 'steps' },
      ],
    });
    expect(layout.metrics).toEqual([
      { metric: 'water', label: 'Drinks' },
      { metric: 'steps' },
    ]);
  });

  it('cuts the metric list to what the family fits', () => {
    const layout = normalizeWidgetLayout({
      ...base,
      family: 'small',
      style: 'ring',
      metrics: [
        { metric: 'protein' },
        { metric: 'carbs' },
        { metric: 'fat' },
        { metric: 'water' },
      ],
    });
    expect(layout.metrics).toHaveLength(WIDGET_FAMILY_MAX_METRICS.small);
    expect(layout.metrics.map((m) => m.metric)).toEqual(['protein', 'carbs']);
  });

  it('rejects an empty metric list and an overlong name', () => {
    expect(() => normalizeWidgetLayout({ ...base, metrics: [] })).toThrow();
    expect(() =>
      normalizeWidgetLayout({ ...base, name: 'x'.repeat(41) })
    ).toThrow();
  });
});

describe('parseStoredWidgetLayouts', () => {
  it('returns nothing for a non-array', () => {
    expect(parseStoredWidgetLayouts(null)).toEqual([]);
    expect(parseStoredWidgetLayouts({})).toEqual([]);
  });

  it('skips entries it cannot read, such as an unknown metric', () => {
    const layouts = parseStoredWidgetLayouts([
      base,
      { ...base, id: 'b', metrics: [{ metric: 'from_the_future' }] },
      'junk',
    ]);
    expect(layouts.map((l) => l.id)).toEqual(['a']);
  });

  it('caps the list', () => {
    const many = Array.from({ length: MAX_WIDGET_LAYOUTS + 5 }, (_, i) => ({
      ...base,
      id: `id-${i}`,
    }));
    expect(parseStoredWidgetLayouts(many)).toHaveLength(MAX_WIDGET_LAYOUTS);
  });
});
