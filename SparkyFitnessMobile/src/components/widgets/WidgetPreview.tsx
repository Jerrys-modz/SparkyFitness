import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import {
  WIDGET_ACCENT_COLORS,
  WIDGET_PREVIEW_SAMPLES,
  WIDGET_PREVIEW_SIZES,
  type WidgetPreviewSample,
} from '../../constants/widgetBuilder';
import {
  PREVIEW_TITLE_HEIGHT,
  previewLayout,
} from '../../utils/widgetPreviewLayout';
import {
  widgetMetricLabels,
  type WidgetDraft,
} from '../../utils/widgetBuilder';

interface PreviewItem {
  key: string;
  label: string;
  sample: WidgetPreviewSample;
}

const figure = (sample: WidgetPreviewSample): string =>
  sample.unit ? `${sample.number} ${sample.unit}` : sample.number;

function Ring({
  progress,
  size,
  color,
}: {
  progress: number;
  size: number;
  color: string;
}) {
  const stroke = size * 0.11;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke={color}
        strokeOpacity={0.2}
        strokeWidth={stroke}
        fill="none"
      />
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${circumference * Math.max(0, Math.min(1, progress))} ${circumference}`}
        rotation={-90}
        origin={`${center}, ${center}`}
        fill="none"
      />
    </Svg>
  );
}

function Bar({
  progress,
  color,
  height = 6,
}: {
  progress: number;
  color: string;
  height?: number;
}) {
  return (
    <View
      className="rounded-full overflow-hidden"
      style={{ height, backgroundColor: `${color}33` }}
    >
      <View
        className="rounded-full"
        style={{
          height,
          backgroundColor: color,
          width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`,
        }}
      />
    </View>
  );
}

/**
 * An approximation of the widget the draft describes, drawn with made-up
 * figures. It follows the same rules the widget does (style, metric count and
 * StandBy sizing) but is not pixel-exact: the system draws the real one.
 */
const WidgetPreview: React.FC<{ draft: WidgetDraft }> = ({ draft }) => {
  const { t } = useTranslation();
  const labels = widgetMetricLabels(t);
  const color = WIDGET_ACCENT_COLORS[draft.accent];
  const { width, height } = WIDGET_PREVIEW_SIZES[draft.family];
  const isLock = draft.family.startsWith('lock');
  const layout = previewLayout(draft);
  const radius = draft.family === 'lockCircular' ? 999 : isLock ? 16 : 24;

  const items: PreviewItem[] = draft.metrics.map((m) => ({
    key: m.metric,
    label: m.label?.trim() || labels[m.metric],
    sample: WIDGET_PREVIEW_SAMPLES[m.metric],
  }));
  const first = items[0];
  const title = layout.hasTitle
    ? draft.name.trim() ||
      t('widgets.preview.untitled', { defaultValue: 'New widget' })
    : null;

  const summary = items.map((i) => `${i.label} ${figure(i.sample)}`).join(', ');

  const body = () => {
    if (!first) return null;

    if (draft.family === 'lockInline') {
      return (
        <Text className="text-sm text-text-primary" numberOfLines={1}>
          {`${first.label} ${figure(first.sample)}`}
        </Text>
      );
    }

    if (draft.family === 'lockCircular') {
      return (
        <View className="items-center justify-center">
          {draft.style === 'ring' && first.sample.progress !== undefined ? (
            <Ring progress={first.sample.progress} size={56} color={color} />
          ) : null}
          <Text
            className="absolute text-sm font-bold text-text-primary"
            numberOfLines={1}
          >
            {first.sample.number}
          </Text>
        </View>
      );
    }

    if (draft.style === 'ring') {
      return (
        <View className="items-center">
          <View className="items-center justify-center">
            <Ring
              progress={first.sample.progress ?? 0}
              size={layout.ringSize}
              color={color}
            />
            <View className="absolute items-center">
              <Text className="text-lg font-bold text-text-primary">
                {first.sample.number}
              </Text>
              {first.sample.unit ? (
                <Text className="text-[10px] text-text-secondary">
                  {first.sample.unit}
                </Text>
              ) : null}
            </View>
          </View>
          <Text
            className="text-[11px] text-text-secondary"
            style={{ height: 16 }}
            numberOfLines={1}
          >
            {first.label}
          </Text>
          {items[1] ? (
            <Text
              className="text-xs text-text-primary"
              style={{ height: 18 }}
              numberOfLines={1}
            >
              {`${items[1].label} ${figure(items[1].sample)}`}
            </Text>
          ) : null}
        </View>
      );
    }

    if (draft.style === 'value') {
      return (
        <View className="items-center">
          <Text
            className="font-bold text-text-primary"
            style={{ fontSize: draft.standByFriendly ? 44 : 30 }}
            numberOfLines={1}
          >
            {figure(first.sample)}
          </Text>
          <Text
            className="text-xs text-text-secondary"
            style={{ height: 16 }}
            numberOfLines={1}
          >
            {first.label}
          </Text>
          {items[1] && !draft.standByFriendly ? (
            <Text
              className="text-sm text-text-primary"
              style={{ height: 22 }}
              numberOfLines={1}
            >
              {figure(items[1].sample)}
            </Text>
          ) : null}
        </View>
      );
    }

    if (draft.style === 'grid') {
      return (
        <View className="flex-row flex-wrap" style={{ rowGap: layout.tileGap }}>
          {items.map((item) => (
            <View
              key={item.key}
              className="w-1/2"
              style={{ height: layout.tileHeight }}
            >
              <Text
                className="text-[11px] text-text-secondary"
                numberOfLines={1}
              >
                {item.label}
              </Text>
              <Text
                className="text-base font-bold text-text-primary"
                numberOfLines={1}
              >
                {figure(item.sample)}
              </Text>
            </View>
          ))}
        </View>
      );
    }

    // bars and list: fixed-height rows so the budget in widgetPreviewLayout holds
    const compact = draft.family === 'lockRectangular';
    return (
      <View style={{ rowGap: layout.row.gap }}>
        {items.map((item) => (
          <View
            key={item.key}
            style={{ height: layout.row.height, justifyContent: 'center' }}
          >
            <View className="flex-row justify-between items-baseline">
              <Text
                className={
                  compact
                    ? 'text-[11px] text-text-secondary'
                    : 'text-xs text-text-secondary'
                }
                numberOfLines={1}
              >
                {item.label}
              </Text>
              <Text
                className={
                  compact
                    ? 'text-[11px] font-semibold text-text-primary'
                    : 'text-sm font-semibold text-text-primary'
                }
                numberOfLines={1}
              >
                {figure(item.sample)}
              </Text>
            </View>
            {draft.style === 'bars' && item.sample.progress !== undefined ? (
              <View style={{ marginTop: compact ? 0 : 2 }}>
                <Bar
                  progress={item.sample.progress}
                  color={color}
                  height={compact ? 3 : 6}
                />
              </View>
            ) : null}
          </View>
        ))}
      </View>
    );
  };

  // The shadow sits on the outer view; the inner one clips, so nothing the
  // body draws can spill past the widget's edge.
  return (
    <View
      accessible
      accessibilityLabel={t('widgets.preview.a11y', {
        defaultValue: 'Widget preview: {{summary}}',
        summary,
      })}
      className="self-center bg-surface shadow-sm"
      style={{ width, height, borderRadius: radius }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: radius,
          overflow: 'hidden',
          padding: layout.padding,
          justifyContent: isLock ? 'center' : undefined,
          alignItems: draft.family === 'lockCircular' ? 'center' : undefined,
        }}
      >
        {title ? (
          <Text
            className="text-xs font-semibold"
            style={{ color, height: PREVIEW_TITLE_HEIGHT }}
            numberOfLines={1}
          >
            {title}
          </Text>
        ) : null}
        <View
          style={{
            flex: 1,
            justifyContent:
              isLock || draft.style === 'ring' || draft.style === 'value'
                ? 'center'
                : 'flex-start',
          }}
        >
          {body()}
        </View>
      </View>
    </View>
  );
};

export default WidgetPreview;
