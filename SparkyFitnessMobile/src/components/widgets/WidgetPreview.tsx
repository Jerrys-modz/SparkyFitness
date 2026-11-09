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

function Bar({ progress, color }: { progress: number; color: string }) {
  return (
    <View
      className="h-1.5 rounded-full overflow-hidden"
      style={{ backgroundColor: `${color}33` }}
    >
      <View
        className="h-1.5 rounded-full"
        style={{
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

  const items: PreviewItem[] = draft.metrics.map((m) => ({
    key: m.metric,
    label: m.label?.trim() || labels[m.metric],
    sample: WIDGET_PREVIEW_SAMPLES[m.metric],
  }));
  const first = items[0];
  const title =
    draft.showTitle && !draft.standByFriendly && !isLock
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
      const size = 56;
      return (
        <View className="items-center justify-center">
          {draft.style === 'ring' && first.sample.progress !== undefined ? (
            <Ring progress={first.sample.progress} size={size} color={color} />
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
      const size = draft.family === 'small' ? 84 : 96;
      return (
        <View className="items-center flex-1 justify-center">
          <View className="items-center justify-center">
            <Ring
              progress={first.sample.progress ?? 0}
              size={size}
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
          <Text className="text-[11px] text-text-secondary mt-1">
            {first.label}
          </Text>
          {items[1] ? (
            <Text className="text-xs text-text-primary mt-0.5">
              {`${items[1].label} ${figure(items[1].sample)}`}
            </Text>
          ) : null}
        </View>
      );
    }

    if (draft.style === 'value') {
      return (
        <View className="items-center flex-1 justify-center">
          <Text
            className="font-bold text-text-primary"
            style={{ fontSize: draft.standByFriendly ? 44 : 30 }}
          >
            {figure(first.sample)}
          </Text>
          <Text className="text-xs text-text-secondary">{first.label}</Text>
          {items[1] && !draft.standByFriendly ? (
            <Text className="text-sm text-text-primary mt-1">
              {figure(items[1].sample)}
            </Text>
          ) : null}
        </View>
      );
    }

    if (draft.style === 'grid') {
      return (
        <View className="flex-row flex-wrap">
          {items.map((item) => (
            <View key={item.key} className="w-1/2 mb-2">
              <Text
                className="text-[11px] text-text-secondary"
                numberOfLines={1}
              >
                {item.label}
              </Text>
              <Text className="text-lg font-bold text-text-primary">
                {figure(item.sample)}
              </Text>
            </View>
          ))}
        </View>
      );
    }

    // bars and list
    return (
      <View className="gap-2">
        {items.map((item) => (
          <View key={item.key}>
            <View className="flex-row justify-between items-baseline">
              <Text className="text-xs text-text-secondary" numberOfLines={1}>
                {item.label}
              </Text>
              <Text className="text-sm font-semibold text-text-primary">
                {figure(item.sample)}
              </Text>
            </View>
            {draft.style === 'bars' && item.sample.progress !== undefined ? (
              <View className="mt-1">
                <Bar progress={item.sample.progress} color={color} />
              </View>
            ) : null}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View
      accessible
      accessibilityLabel={t('widgets.preview.a11y', {
        defaultValue: 'Widget preview: {{summary}}',
        summary,
      })}
      className="self-center bg-surface shadow-sm p-3"
      style={{
        width,
        height,
        borderRadius: draft.family === 'lockCircular' ? 999 : isLock ? 16 : 24,
        justifyContent: isLock ? 'center' : undefined,
        alignItems: draft.family === 'lockCircular' ? 'center' : undefined,
      }}
    >
      {title ? (
        <Text
          className="text-xs font-semibold mb-1"
          style={{ color }}
          numberOfLines={1}
        >
          {title}
        </Text>
      ) : null}
      {body()}
    </View>
  );
};

export default WidgetPreview;
