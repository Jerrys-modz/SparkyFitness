import {
  WIDGET_FAMILIES,
  WIDGET_FAMILY_MAX_METRICS,
  WIDGET_FAMILY_STYLES,
  WIDGET_METRICS,
} from '@workspace/shared';
import { WIDGET_PREVIEW_SIZES } from '../../src/constants/widgetBuilder';
import {
  PREVIEW_TITLE_HEIGHT,
  previewBodyHeight,
  previewHasTitle,
  previewLayout,
} from '../../src/utils/widgetPreviewLayout';
import {
  emptyWidgetDraft,
  type WidgetDraft,
} from '../../src/utils/widgetBuilder';

const draftFor = (
  family: WidgetDraft['family'],
  style: WidgetDraft['style'],
  count: number,
  overrides: Partial<WidgetDraft> = {}
): WidgetDraft => ({
  ...emptyWidgetDraft(),
  family,
  style,
  metrics: WIDGET_METRICS.slice(0, count).map((metric) => ({ metric })),
  ...overrides,
});

// Every size, every style it allows, every count it fits, with and without
// the title and StandBy: the preview body must fit inside its card. This is
// what stopped the content spilling over the note below the preview.
const cases: [string, WidgetDraft][] = [];
for (const family of WIDGET_FAMILIES) {
  for (const style of WIDGET_FAMILY_STYLES[family]) {
    for (let count = 1; count <= WIDGET_FAMILY_MAX_METRICS[family]; count++) {
      for (const showTitle of [true, false]) {
        for (const standByFriendly of [true, false]) {
          cases.push([
            `${family} / ${style} / ${count} numbers / title ${showTitle} / standBy ${standByFriendly}`,
            draftFor(family, style, count, { showTitle, standByFriendly }),
          ]);
        }
      }
    }
  }
}

describe('previewBodyHeight', () => {
  it.each(cases)('fits in its card: %s', (_name, draft) => {
    const layout = previewLayout(draft);
    const titleHeight = layout.hasTitle ? PREVIEW_TITLE_HEIGHT : 0;
    expect(previewBodyHeight(draft, layout) + titleHeight).toBeLessThanOrEqual(
      layout.contentHeight
    );
  });

  it('covers every family', () => {
    const families = new Set(cases.map(([name]) => name.split(' / ')[0]));
    expect(families.size).toBe(WIDGET_FAMILIES.length);
  });
});

describe('previewLayout', () => {
  it('leaves the ring big enough to read in a small widget with a second number', () => {
    const layout = previewLayout(
      draftFor('small', 'ring', 2, { showTitle: true })
    );
    expect(layout.ringSize).toBeGreaterThanOrEqual(44);
  });

  it('gives the ring more room without a title', () => {
    const withTitle = previewLayout(draftFor('small', 'ring', 1));
    const without = previewLayout(
      draftFor('small', 'ring', 1, { showTitle: false })
    );
    expect(without.ringSize).toBeGreaterThanOrEqual(withTitle.ringSize);
  });

  it('compacts a medium widget with four bars so all four fit', () => {
    const four = previewLayout(draftFor('medium', 'bars', 4));
    const three = previewLayout(draftFor('medium', 'bars', 3));
    expect(four.row.height).toBeLessThan(three.row.height);
  });

  it('keeps the card as tall as the widget it imitates', () => {
    const draft = draftFor('large', 'list', 3);
    const { height } = WIDGET_PREVIEW_SIZES.large;
    const layout = previewLayout(draft);
    expect(layout.contentHeight + layout.padding * 2).toBe(height);
  });
});

describe('previewHasTitle', () => {
  it('hides the name on Lock Screen shapes and in StandBy', () => {
    expect(previewHasTitle(draftFor('lockCircular', 'ring', 1))).toBe(false);
    expect(
      previewHasTitle(draftFor('small', 'ring', 1, { standByFriendly: true }))
    ).toBe(false);
    expect(previewHasTitle(draftFor('small', 'ring', 1))).toBe(true);
  });
});
