import { forwardRef } from 'react';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import type { WorkoutShareData } from '../utils/workoutShareCard';

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

const COLORS = {
  background: '#0f172a',
  panel: '#1e293b',
  accent: '#3b82f6',
  record: '#f59e0b',
  text: '#f8fafc',
  muted: '#94a3b8',
};

interface Props {
  data: WorkoutShareData;
  recordsLabel: string;
  footer: string;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The workout summary drawn as SVG so it can be turned into a PNG with
 * `toDataURL` — no screenshot library needed. Fixed 1080×1350 canvas.
 */
const WorkoutShareCard = forwardRef<Svg, Props>(function WorkoutShareCard(
  { data, recordsLabel, footer },
  ref
) {
  const columns = 3;
  const tileW = 300;
  const tileH = 150;
  const gap = 30;
  const startX = 60;
  const statsTop = 330;
  const rows = Math.ceil(data.stats.length / columns);
  const listTop = statsTop + rows * (tileH + gap) + 30;

  let y = listTop;
  const lines: { text: string; color: string; size: number; weight: string }[] =
    [];
  if (data.records.length > 0) {
    lines.push({
      text: recordsLabel,
      color: COLORS.record,
      size: 32,
      weight: '700',
    });
    data.records.forEach((r) =>
      lines.push({
        text: `★ ${clip(r, 34)}`,
        color: COLORS.text,
        size: 40,
        weight: '600',
      })
    );
  }
  if (data.exercises.length > 0) {
    if (lines.length > 0) {
      lines.push({ text: ' ', color: COLORS.text, size: 24, weight: '400' });
    }
    data.exercises.forEach((e) =>
      lines.push({
        text: clip(e, 38),
        color: COLORS.muted,
        size: 38,
        weight: '500',
      })
    );
  }

  return (
    <Svg
      ref={ref}
      width={SHARE_CARD_WIDTH}
      height={SHARE_CARD_HEIGHT}
      viewBox={`0 0 ${SHARE_CARD_WIDTH} ${SHARE_CARD_HEIGHT}`}
    >
      <Rect
        width={SHARE_CARD_WIDTH}
        height={SHARE_CARD_HEIGHT}
        fill={COLORS.background}
      />
      <Rect x={60} y={90} width={120} height={10} rx={5} fill={COLORS.accent} />
      <SvgText x={60} y={210} fontSize={76} fontWeight="800" fill={COLORS.text}>
        {clip(data.title, 22)}
      </SvgText>
      <SvgText x={60} y={275} fontSize={36} fill={COLORS.muted}>
        {data.dateText}
      </SvgText>
      {data.stats.map((stat, i) => {
        const x = startX + (i % columns) * (tileW + gap);
        const top = statsTop + Math.floor(i / columns) * (tileH + gap);
        return (
          <Rect
            key={`tile-${stat.label}`}
            x={x}
            y={top}
            width={tileW}
            height={tileH}
            rx={24}
            fill={COLORS.panel}
          />
        );
      })}
      {data.stats.map((stat, i) => {
        const x = startX + (i % columns) * (tileW + gap) + 28;
        const top = statsTop + Math.floor(i / columns) * (tileH + gap);
        return [
          <SvgText
            key={`label-${stat.label}`}
            x={x}
            y={top + 50}
            fontSize={26}
            fill={COLORS.muted}
          >
            {stat.label.toUpperCase()}
          </SvgText>,
          <SvgText
            key={`value-${stat.label}`}
            x={x}
            y={top + 112}
            fontSize={clip(stat.value, 12).length > 8 ? 40 : 52}
            fontWeight="700"
            fill={COLORS.text}
          >
            {clip(stat.value, 12)}
          </SvgText>,
        ];
      })}
      {lines.map((line, i) => {
        y += line.size + 22;
        return (
          <SvgText
            key={`line-${i}`}
            x={60}
            y={y}
            fontSize={line.size}
            fontWeight={line.weight}
            fill={line.color}
          >
            {line.text}
          </SvgText>
        );
      })}
      <SvgText
        x={60}
        y={SHARE_CARD_HEIGHT - 70}
        fontSize={32}
        fontWeight="700"
        fill={COLORS.accent}
      >
        {footer}
      </SvgText>
    </Svg>
  );
});

export default WorkoutShareCard;
