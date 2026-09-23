import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBodyMapSvgQuery } from '@/hooks/Exercises/useExercises';
import {
  heatLevel,
  setsForMuscleKey,
  svgClassToMuscleKey,
  unmappedMuscleSets,
} from '@/constants/exercises';
import './MuscleHeatmap.css';

interface MuscleHeatmapProps {
  setsByMuscle: Record<string, number>;
}

interface PickedMuscle {
  key: string;
  sets: number;
}

export const MuscleHeatmap = ({ setsByMuscle }: MuscleHeatmapProps) => {
  const { t } = useTranslation();
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const { data: svgContent } = useBodyMapSvgQuery();
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const maxSets = Math.max(0, ...Object.values(setsByMuscle));
  const extra = unmappedMuscleSets(setsByMuscle);
  const setsLabel = t('muscleHeatmap.sets', 'sets');
  const picked: PickedMuscle | null = pickedKey
    ? { key: pickedKey, sets: setsForMuscleKey(pickedKey, setsByMuscle) }
    : null;

  useEffect(() => {
    if (!svgContent || !svgContainerRef.current) return;
    const container = svgContainerRef.current;
    container.innerHTML = svgContent;

    const svgElement = container.querySelector('svg');
    if (!svgElement) return;

    svgElement.setAttribute('width', '100%');
    svgElement.style.maxWidth = '280px';
    svgElement.style.height = 'auto';

    const cleanups: (() => void)[] = [];

    svgElement.querySelectorAll('path[class]').forEach((path) => {
      const svgClassName = path.getAttribute('class') || '';
      const key = svgClassToMuscleKey(svgClassName);
      const sets = setsForMuscleKey(key, setsByMuscle);
      const level = heatLevel(sets, maxSets);
      path.classList.remove('heat-0', 'heat-1', 'heat-2', 'heat-3', 'heat-4');
      path.classList.add(`heat-${level}`);
      path.setAttribute('data-muscle', key);
      const label = `${key} · ${sets} ${setsLabel}`;
      path.setAttribute('role', 'button');
      path.setAttribute('tabindex', '0');
      path.setAttribute('aria-label', label);

      const pick = () => {
        setPickedKey((current) => (current === key ? null : key));
      };
      const onKeyDown = (event: Event) => {
        const keyEvent = event as KeyboardEvent;
        if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
        keyEvent.preventDefault();
        pick();
      };
      path.addEventListener('click', pick);
      path.addEventListener('keydown', onKeyDown);
      cleanups.push(() => {
        path.removeEventListener('click', pick);
        path.removeEventListener('keydown', onKeyDown);
      });
    });

    svgElement.querySelectorAll('path[data-muscle="lats"]').forEach((path) => {
      svgElement.appendChild(path);
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [svgContent, setsByMuscle, maxSets, setsLabel]);

  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;
    container.querySelectorAll('path[data-muscle]').forEach((path) => {
      const selected = path.getAttribute('data-muscle') === pickedKey;
      path.classList.toggle('is-selected', selected);
      path.classList.toggle('is-dimmed', pickedKey !== null && !selected);
      path.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }, [pickedKey, svgContent, setsByMuscle, maxSets]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('muscleHeatmap.title', 'Muscle Heat Map')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t(
            'muscleHeatmap.subtitle',
            'Working sets on primary muscles in this date range'
          )}
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          <div
            ref={svgContainerRef}
            className="muscle-heatmap w-full flex justify-center overflow-hidden max-w-[280px]"
          />
          {picked ? (
            <div
              role="status"
              className="mt-3 rounded-full border bg-popover px-3 py-1.5 text-sm shadow-md"
            >
              <span className="font-medium capitalize">{picked.key}</span>
              <span className="text-muted-foreground">
                {' '}
                · {picked.sets} {setsLabel}
              </span>
            </div>
          ) : (
            <p className="mt-3 text-[10px] text-muted-foreground">
              {t('muscleHeatmap.tap', 'Tap a muscle')}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-3 text-[10px] text-muted-foreground">
            <span>{t('muscleHeatmap.fewer', 'Fewer')}</span>
            {['#374151', '#86efac', '#22c55e', '#eab308', '#e11d48'].map(
              (color) => (
                <span
                  key={color}
                  className="inline-block w-3 h-3 rounded-[2px]"
                  style={{ backgroundColor: color }}
                />
              )
            )}
            <span>{t('muscleHeatmap.more', 'More')}</span>
          </div>
          {extra.length > 0 && (
            <div className="mt-3 w-full">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                {t('muscleHeatmap.notOnFigure', 'Not on the figure')}
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                {extra.map((row) => (
                  <li
                    key={row.muscle}
                    className="flex items-center justify-between"
                  >
                    <span className="capitalize">{row.muscle}</span>
                    <span>
                      {row.sets} {setsLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
