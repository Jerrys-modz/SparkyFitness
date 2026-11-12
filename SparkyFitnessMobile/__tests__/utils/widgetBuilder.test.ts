import {
  WIDGET_FAMILY_MAX_METRICS,
  normalizeWidgetLayout,
} from '@workspace/shared';
import { WIDGET_TEMPLATES } from '../../src/constants/widgetBuilder';
import {
  draftFromLayout,
  draftIsValid,
  draftToInput,
  emptyWidgetDraft,
  applyWidgetTemplate,
  capWidgetName,
  reconcileWidgetDraft,
  setDraftFamily,
  setDraftMetricLabel,
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

describe('number labels', () => {
  it('sets a label on one number and leaves the others', () => {
    const start = draft({
      family: 'medium',
      metrics: [{ metric: 'protein' }, { metric: 'carbs' }],
    });
    const next = setDraftMetricLabel(start, 'protein', 'P');
    expect(next.metrics).toEqual([
      { metric: 'protein', label: 'P' },
      { metric: 'carbs' },
    ]);
  });

  it('keeps what is typed, spaces included, until it is saved', () => {
    const next = setDraftMetricLabel(draft(), 'calories_remaining', 'Left ');
    expect(next.metrics[0].label).toBe('Left ');
  });

  it('saves trimmed labels and drops blank ones', () => {
    const start = draft({
      family: 'medium',
      metrics: [
        { metric: 'protein', label: '  P  ' },
        { metric: 'carbs', label: '   ' },
        { metric: 'fat', label: '' },
      ],
    });
    expect(draftToInput(start).metrics).toEqual([
      { metric: 'protein', label: 'P' },
      { metric: 'carbs' },
      { metric: 'fat' },
    ]);
  });
});

describe('capWidgetName', () => {
  it('trims and leaves a short name alone', () => {
    expect(capWidgetName('  Morning copy ')).toBe('Morning copy');
  });

  it('cuts a long name to the limit without splitting a character', () => {
    const capped = capWidgetName('😀'.repeat(60));
    expect(Array.from(capped)).toHaveLength(40);
  });
});

describe('widget templates', () => {
  it.each(WIDGET_TEMPLATES.map((template) => [template.key, template]))(
    '%s is valid as written, so the widget draws it unchanged',
    (_key, template) => {
      const normalized = normalizeWidgetLayout({
        id: 't',
        name: 'T',
        family: template.family,
        style: template.style,
        metrics: template.metrics.map((metric) => ({ metric })),
        accent: template.accent,
      });
      expect(normalized.style).toBe(template.style);
      expect(normalized.metrics.map((m) => m.metric)).toEqual([
        ...template.metrics,
      ]);
    }
  );

  it('has one template per key', () => {
    const keys = WIDGET_TEMPLATES.map((template) => template.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('applies a template and names a blank widget after it', () => {
    const macros = WIDGET_TEMPLATES.find((t) => t.key === 'macros')!;
    const next = applyWidgetTemplate(
      { ...emptyWidgetDraft(), name: '   ' },
      macros,
      'Macros'
    );
    expect(next).toMatchObject({
      name: 'Macros',
      family: 'medium',
      style: 'bars',
      accent: 'blue',
    });
    expect(next.metrics.map((m) => m.metric)).toEqual([
      'protein',
      'carbs',
      'fat',
    ]);
  });

  it("keeps the person's own name and title choices", () => {
    const fasting = WIDGET_TEMPLATES.find((t) => t.key === 'fasting')!;
    const next = applyWidgetTemplate(
      { ...emptyWidgetDraft(), name: 'Mine', showTitle: false },
      fasting,
      'Fasting clock'
    );
    expect(next.name).toBe('Mine');
    expect(next.showTitle).toBe(false);
    expect(next.metrics).toEqual([{ metric: 'fasting_elapsed' }]);
  });
});
