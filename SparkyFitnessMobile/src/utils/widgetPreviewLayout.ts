import type { WidgetFamily } from '@workspace/shared';
import { WIDGET_PREVIEW_SIZES } from '../constants/widgetBuilder';
import type { WidgetDraft } from './widgetBuilder';

/**
 * Space budget for the editor's widget preview. The preview is drawn at a
 * fixed size like the real widget, so its content has to be sized to fit: rows
 * have fixed heights and the ring takes what is left. `previewBodyHeight` is
 * what the body needs and `previewLayout` what it has, and a test checks the
 * first never exceeds the second for any size, style and number of metrics.
 */

/** Padding inside the card, by family: Lock Screen shapes are tighter. */
const PADDING: Record<WidgetFamily, number> = {
  small: 12,
  medium: 12,
  large: 12,
  lockCircular: 6,
  lockRectangular: 8,
  lockInline: 4,
};

export const PREVIEW_TITLE_HEIGHT = 18;
const RING_LABEL_HEIGHT = 16;
const RING_SECOND_HEIGHT = 18;
const MIN_RING = 44;
const MAX_RING = 96;
const TILE_HEIGHT = 40;
const TILE_GAP = 8;
const LOCK_CIRCLE = 56;
const LOCK_INLINE_HEIGHT = 20;

export interface PreviewRow {
  height: number;
  gap: number;
}

export interface PreviewLayout {
  padding: number;
  hasTitle: boolean;
  /** Card height minus padding. */
  contentHeight: number;
  /** What is left for the body once the title is drawn. */
  bodyHeight: number;
  ringSize: number;
  row: PreviewRow;
  tileHeight: number;
  tileGap: number;
}

export function previewHasTitle(draft: WidgetDraft): boolean {
  return (
    draft.showTitle &&
    !draft.standByFriendly &&
    !draft.family.startsWith('lock')
  );
}

/**
 * Row height and gap for the bars and list styles. A medium widget with more
 * than three bars is compacted so the fourth still fits; Lock Screen rows are
 * tight.
 */
function rowDims(
  family: WidgetFamily,
  style: WidgetDraft['style'],
  count: number
): PreviewRow {
  if (family === 'lockRectangular') return { height: 17, gap: 1 };
  if (style === 'bars') {
    return family === 'medium' && count > 3
      ? { height: 24, gap: 4 }
      : { height: 30, gap: 8 };
  }
  return { height: 22, gap: 6 };
}

export function previewLayout(draft: WidgetDraft): PreviewLayout {
  const { height } = WIDGET_PREVIEW_SIZES[draft.family];
  const padding = PADDING[draft.family];
  const hasTitle = previewHasTitle(draft);
  const contentHeight = height - padding * 2;
  const bodyHeight = contentHeight - (hasTitle ? PREVIEW_TITLE_HEIGHT : 0);
  const count = draft.metrics.length;

  // The ring takes what the title, label and second number leave.
  const reserved = RING_LABEL_HEIGHT + (count > 1 ? RING_SECOND_HEIGHT : 0);
  const ringSize = Math.max(
    MIN_RING,
    Math.min(MAX_RING, bodyHeight - reserved)
  );

  return {
    padding,
    hasTitle,
    contentHeight,
    bodyHeight,
    ringSize,
    row: rowDims(draft.family, draft.style, count),
    tileHeight: TILE_HEIGHT,
    tileGap: TILE_GAP,
  };
}

/** The height the preview body will take for this draft. */
export function previewBodyHeight(
  draft: WidgetDraft,
  layout: PreviewLayout = previewLayout(draft)
): number {
  const count = draft.metrics.length;
  if (draft.family === 'lockInline') return LOCK_INLINE_HEIGHT;
  if (draft.family === 'lockCircular') return LOCK_CIRCLE;

  switch (draft.style) {
    case 'ring':
      return (
        layout.ringSize +
        RING_LABEL_HEIGHT +
        (count > 1 ? RING_SECOND_HEIGHT : 0)
      );
    case 'value':
      return (
        (draft.standByFriendly ? 52 : 36) +
        16 +
        (count > 1 && !draft.standByFriendly ? 22 : 0)
      );
    case 'grid': {
      const rows = Math.ceil(count / 2);
      return rows * layout.tileHeight + (rows - 1) * layout.tileGap;
    }
    default:
      return count * layout.row.height + (count - 1) * layout.row.gap;
  }
}
