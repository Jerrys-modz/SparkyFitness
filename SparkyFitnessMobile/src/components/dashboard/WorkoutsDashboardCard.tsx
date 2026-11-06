import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseSessionResponse } from '@workspace/shared';

import { useActiveWorkoutPlans } from '../../hooks/useActiveWorkoutPlan';
import type {
  WorkoutPlanAssignment,
  WorkoutPlanTemplate,
} from '../../types/workoutPlans';
import {
  getLoggedAssignmentIds,
  getUncompletedActivePlans,
} from '../../utils/workoutPlanSchedule';
import {
  buildSessionSubtitle,
  getWorkoutSummary,
} from '../../utils/workoutSession';
import Icon from '../Icon';
import DashboardCardHeader from './DashboardCardHeader';

interface WorkoutsDashboardCardProps {
  date: string;
  /** Planned workouts can only be started today, so they show only on today. */
  isToday: boolean;
  sessions: ExerciseSessionResponse[];
  weightUnit: 'kg' | 'lbs';
  distanceUnit: 'km' | 'miles';
  onOpenSession: (session: ExerciseSessionResponse) => void;
  onStartPlanned: (
    plan: WorkoutPlanTemplate,
    assignment: WorkoutPlanAssignment
  ) => void;
  onLog: () => void;
  onRecord: () => void;
}

/**
 * The day's workouts on the Activity tab: each logged session with its summary line,
 * then what the active workout plans still have due today with a Start button, and Log
 * and Record actions in the header. A logged session opens the same screen as in the
 * Diary.
 */
const WorkoutsDashboardCard: React.FC<WorkoutsDashboardCardProps> = ({
  date,
  isToday,
  sessions,
  weightUnit,
  distanceUnit,
  onOpenSession,
  onStartPlanned,
  onLog,
  onRecord,
}) => {
  const { t } = useTranslation();
  const accent = useCSSVariable('--color-accent-primary') as string;
  const { plans } = useActiveWorkoutPlans(date, { enabled: isToday });
  const planned = useMemo(
    () =>
      isToday
        ? getUncompletedActivePlans(plans, getLoggedAssignmentIds(sessions))
            .map((plan) => ({ plan, assignment: plan.next_assignment }))
            .filter(
              (
                item
              ): item is {
                plan: WorkoutPlanTemplate;
                assignment: WorkoutPlanAssignment;
              } => item.assignment != null
            )
        : [],
    [isToday, plans, sessions]
  );

  return (
    <View
      testID="workouts-dashboard-card"
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
    >
      <DashboardCardHeader
        icon="exercise"
        title={t('dashboard.workoutsCard.title', {
          defaultValue: 'Workouts',
        })}
        right={
          <View className="flex-row gap-2">
            <Pressable
              testID="workouts-dashboard-card-log"
              onPress={onLog}
              accessibilityRole="button"
              className="flex-row items-center bg-raised rounded-lg px-3 py-1.5"
            >
              <Icon name="add" size={14} color={accent} />
              <Text className="text-accent-primary text-sm font-medium ml-1">
                {t('dashboard.workoutsCard.log', { defaultValue: 'Log' })}
              </Text>
            </Pressable>
            <Pressable
              testID="workouts-dashboard-card-record"
              onPress={onRecord}
              accessibilityRole="button"
              className="flex-row items-center bg-accent-primary rounded-lg px-3 py-1.5"
            >
              <Icon name="play" size={12} color="#FFFFFF" />
              <Text className="text-white text-sm font-semibold ml-1">
                {t('dashboard.workoutsCard.record', {
                  defaultValue: 'Record',
                })}
              </Text>
            </Pressable>
          </View>
        }
      />
      {sessions.length === 0 && planned.length === 0 ? (
        <Text className="text-sm text-text-muted">
          {t('dashboard.workoutsCard.empty', {
            defaultValue: 'No workouts logged yet.',
          })}
        </Text>
      ) : (
        <View className="gap-2">
          {sessions.map((session) => {
            const { name, duration, calories } = getWorkoutSummary(session, t);
            return (
              <Pressable
                key={`${session.type}-${session.id}`}
                testID={`workouts-dashboard-card-session-${session.id}`}
                onPress={() => onOpenSession(session)}
                accessibilityRole="button"
                className="flex-row items-center bg-raised rounded-lg px-3 py-2.5 gap-3"
              >
                <Icon
                  name={
                    session.type === 'preset'
                      ? 'exercise-weights'
                      : 'exercise-running'
                  }
                  size={18}
                  color={accent}
                />
                <View className="flex-1">
                  <Text
                    className="text-sm font-semibold text-text-primary"
                    numberOfLines={1}
                  >
                    {name}
                  </Text>
                  <Text className="text-xs text-text-muted" numberOfLines={1}>
                    {buildSessionSubtitle(
                      session,
                      duration,
                      calories,
                      t,
                      weightUnit,
                      distanceUnit
                    )}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={14} color={accent} />
              </Pressable>
            );
          })}
          {planned.map(({ plan, assignment }) => (
            <View
              key={`plan-${plan.id}`}
              testID={`workouts-dashboard-card-planned-${plan.id}`}
              className="flex-row items-center bg-raised rounded-lg px-3 py-2.5 gap-3"
            >
              <Icon name="calendar" size={18} color={accent} />
              <View className="flex-1">
                <Text
                  className="text-sm font-semibold text-text-primary"
                  numberOfLines={1}
                >
                  {assignment.session_name ||
                    assignment.workout_preset_name ||
                    assignment.exercise_name ||
                    plan.plan_name}
                </Text>
                <Text className="text-xs text-text-muted" numberOfLines={1}>
                  {t('dashboard.workoutsCard.planned', {
                    defaultValue: 'Planned · {{plan}}',
                    plan: plan.plan_name,
                  })}
                </Text>
              </View>
              <Pressable
                testID={`workouts-dashboard-card-start-${plan.id}`}
                onPress={() => onStartPlanned(plan, assignment)}
                accessibilityRole="button"
                className="flex-row items-center bg-accent-primary rounded-lg px-3 py-1.5"
              >
                <Icon name="play" size={12} color="#FFFFFF" />
                <Text className="text-white text-sm font-semibold ml-1">
                  {t('dashboard.workoutsCard.start', {
                    defaultValue: 'Start',
                  })}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

export default WorkoutsDashboardCard;
