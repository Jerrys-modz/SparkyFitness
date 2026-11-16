import type { ComponentType, ReactNode } from 'react';
import WidgetGrid from '@/components/widgets/WidgetGrid';
import {
  generateDefaultLayouts,
  isMealWidgetKey,
  type DashboardLayouts,
} from '@/utils/dashboardLayout';

export interface DiaryWidget {
  key: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  render: () => ReactNode;
}

interface DiaryWidgetGridProps {
  widgets: DiaryWidget[];
  toolbarContainer?: HTMLElement | null;
}

const PAGE_KEY = 'diary';

/**
 * Widgets hidden until the person turns them on in Customize layout. Weight
 * figures are not for everyone on the first screen of the day.
 */
const DIARY_DEFAULT_HIDDEN = ['weightProgress'];

const diaryDefaultLayouts = (widgetKeys: string[]): DashboardLayouts =>
  generateDefaultLayouts(widgetKeys.filter(isMealWidgetKey));

const DiaryWidgetGrid = ({
  widgets,
  toolbarContainer,
}: DiaryWidgetGridProps) => (
  <WidgetGrid
    pageKey={PAGE_KEY}
    widgets={widgets}
    generateDefaultLayouts={diaryDefaultLayouts}
    defaultHidden={DIARY_DEFAULT_HIDDEN}
    toolbarContainer={toolbarContainer}
  />
);

export default DiaryWidgetGrid;
