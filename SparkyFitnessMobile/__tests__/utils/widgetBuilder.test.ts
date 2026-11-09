import { WIDGET_FAMILY_MAX_METRICS } from '@workspace/shared';
import {
  draftFromLayout,
  draftIsValid,
  draftToInput,
  emptyWidgetDraft,
  reconcileWidgetDraft,
  setDraftFamily,
  toggleDraftMetric,
  type WidgetDraft,
} from '../../src/utils/widgetBuilder';

const draft = (overrides: Partial<WidgetDraft> = {}): WidgetDraft => ({
  ...emptyWidgetDraft(),
  name: 'Morning',
  ...overrides,
});

describe('toggleDraftMetric', () => {
  it('adds a metric', () => {
    const next = toggleDraftMetric(draft(), 'protein');
    expect(next.metrics.map((m) => m.metric)).toEqual([
      'calories_remaining',
      'protein',
    ]);
  });

  it('removes a metric that is already there', () => {
    const start = draft({
      metrics: [{ metric: 'protein' }, { metric: 'carbs' }],
    });
    expect(toggleDraftMetric(start, 'protein').metrics).toEqual([
      { metric: 'carbs' },
    ]);
  });

  it('never removes the last metric', () => {
    const start = draft();
    expect(toggleDraftMetric(start, 'calories_remaining')).toBe(start);
  });

  it('does not add past what the family fits', () => {
    const start = draft({
      family: 'small',
      metrics: [{ metric: 'protein' }, { metric: 'carbs' }],
    });
    expect(start.metrics).toHaveLength(WIDGET_FAMILY_MAX_METRICS.small);
    expect(toggleDraftMetric(start, 'fat')).toBe(start);
  });
});

describe('setDraftFamily', () => {
  it('falls back to the new family default when the style does not fit', () => {
    const next = setDraftFamily(
      draft({ family: 'medium', style: 'grid' }),
      'small'
    );
    expect(next.family).toBe('small');
    expect(next.style).toBe('ring');
  });

  it('keeps a style the new family allows', () => {
    const next = setDraftFamily(draft({ style: 'bars' }), 'medium');
    expect(next.style).toBe('bars');
  });

  it('cuts the metrics to what the new family fits', () => {
    const start = draft({
      family: 'large',
      style: 'list',
      metrics: [
        { metric: 'protein' },
        { metric: 'carbs' },
        { metric: 'fat' },
        { metric: 'water' },
      ],
    });
    const next = setDraftFamily(start, 'lockCircular');
    expect(next.metrics).toEqual([{ metric: 'protein' }]);
  });
});

describe('reconcileWidgetDraft', () => {
  it('accepts a blank name while editing', () => {
    expect(() => reconcileWidgetDraft(draft({ name: '' }))).not.toThrow();
  });

  it('leaves an empty metric list alone instead of throwing', () => {
    const empty = draft({ metrics: [] });
    expect(reconcileWidgetDraft(empty)).toBe(empty);
  });
});

describe('draft conversion', () => {
  it('trims the name when saving and needs one to be valid', () => {
    expect(draftToInput(draft({ name: '  Morning  ' })).name).toBe('Morning');
    expect(draftIsValid(draft({ name: '   ' }))).toBe(false);
    expect(draftIsValid(draft())).toBe(true);
  });

  it('round-trips a stored layout', () => {
    const input = draftToInput(
      draft({ accent: 'teal', standByFriendly: true })
    );
    const back = draftFromLayout({
      ...input,
      id: 'x',
      version: 1,
      accent: 'teal',
      showTitle: true,
      standByFriendly: true,
      updatedAt: 0,
    } as Parameters<typeof draftFromLayout>[0]);
    expect(back).toMatchObject({
      name: 'Morning',
      accent: 'teal',
      standByFriendly: true,
    });
  });
});
