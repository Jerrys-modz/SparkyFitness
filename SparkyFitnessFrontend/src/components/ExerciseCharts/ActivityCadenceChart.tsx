import { useTranslation } from 'react-i18next';
import { ChartDataPoint } from '@/types/reports';
import { ActivitySensorChart } from './ActivitySensorChart';

interface ActivityCadenceChartProps {
  data: ChartDataPoint[];
  xAxisMode: string;
  getXAxisDataKey: () => string;
  getXAxisLabel: () => string;
  distanceUnit: string;
}

export const ActivityCadenceChart = (props: ActivityCadenceChartProps) => {
  const { t } = useTranslation();
  return (
    <ActivitySensorChart
      {...props}
      dataKey="runCadence"
      title={t('reports.activityReport.runCadenceSpM')}
      color="#387900"
    />
  );
};
