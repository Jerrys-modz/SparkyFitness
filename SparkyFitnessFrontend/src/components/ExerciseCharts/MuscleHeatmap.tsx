import { useEffect, useRef } from 'react';
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

export const MuscleHeatmap = ({ setsByMuscle }: MuscleHeatmapProps) => {
  const { t } = useTranslation();
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const { data: svgContent } = useBodyMapSvgQuery();
  const maxSets = Math.max(0, ...Object.values(setsByMuscle));
  const extra = unmappedMuscleSets(setsByMuscle);

  useEffect(() => {
    if (!svgContent || !svgContainerRef.current) return;
    const container = svgContainerRef.current;
    container.innerHTML = svgContent;

    const svgElement = container.querySelector('svg');
    if (!svgElement) return;

    svgElement.setAttribute('width', '100%');
    svgElement.style.maxWidth = '280px';
    svgElement.style.height = 'auto';

    svgElement.querySelectorAll('path[class]').forEach((path) => {
      const svgClassName = path.getAttribute('class') || '';
      const key = svgClassToMuscleKey(svgClassName);
      const sets = setsForMuscleKey(key, setsByMuscle);
      const level = heatLevel(sets, maxSets);
      path.classList.remove('heat-0', 'heat-1', 'heat-2', 'heat-3', 'heat-4');
      path.classList.add(`heat-${level}`);
      const label = `${key} · ${sets} ${t('muscleHeatmap.sets', 'sets')}`;
      path.setAttribute('title', label);
      path.setAttribute('aria-label', label);
    });
  }, [svgContent, setsByMuscle, maxSets, t]);

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
            <ul className="mt-3 w-full text-xs text-muted-foreground space-y-1">
              {extra.map((row) => (
                <li
                  key={row.muscle}
                  className="flex items-center justify-between"
                >
                  <span className="capitalize">{row.muscle}</span>
                  <span>
                    {row.sets} {t('muscleHeatmap.sets', 'sets')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MuscleHeatmap;
