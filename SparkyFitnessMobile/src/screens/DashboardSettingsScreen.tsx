import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import DashboardCardReorderList from '../components/DashboardCardReorderList';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import StatusView from '../components/StatusView';
import Switch from '../components/ui/Switch';
import {
  DASHBOARD_CARD_SUBTITLES,
  DASHBOARD_CARD_TITLES,
  type DashboardCardKey,
} from '../constants/dashboardCards';
import {
  DASHBOARD_TABS,
  DASHBOARD_TAB_LABELS,
  homeTabOf,
  resolveHomeTabCards,
  resolveSummaryCards,
} from '../constants/dashboardTabs';
import {
  useCustomNutrients,
  useNutrientDisplayPreferences,
  useServerConnection,
} from '../hooks';
import { nutrientDisplayPreferencesQueryKey } from '../hooks/queryKeys';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  updateNutrientDisplayPreference,
  type NutrientDisplayPreference,
} from '../services/api/preferencesApi';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import { resolveDashboardCardOrder } from '../utils/dashboardCardPreferences';
import { toggleNutrientVisibility } from '../utils/nutrientUtils';

type DashboardSettingsScreenProps = RootStackScreenProps<'DashboardSettings'>;

const SUMMARY_VIEW_GROUP = 'summary';
const MOBILE_PLATFORM = 'mobile';

// Matches what the server synthesizes for the summary/mobile row when the user
// has never customized it. Only used defensively if the row is somehow absent
// after the preferences query has resolved — the real row is the merge base.
const SERVER_DEFAULT_SUMMARY_NUTRIENTS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'dietary_fiber',
];

const DashboardSettingsScreen: React.FC<DashboardSettingsScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const calorieRingCardVisible = useAppPreferencesStore(
    (s) => s.calorieRingCardVisible
  );
  const setCalorieRingCardVisible = useAppPreferencesStore(
    (s) => s.setCalorieRingCardVisible
  );
  const macrosCardVisible = useAppPreferencesStore((s) => s.macrosCardVisible);
  const setMacrosCardVisible = useAppPreferencesStore(
    (s) => s.setMacrosCardVisible
  );
  const exerciseCardVisible = useAppPreferencesStore(
    (s) => s.exerciseCardVisible
  );
  const setExerciseCardVisible = useAppPreferencesStore(
    (s) => s.setExerciseCardVisible
  );
  const fastingCardVisible = useAppPreferencesStore(
    (s) => s.fastingCardVisible
  );
  const setFastingCardVisible = useAppPreferencesStore(
    (s) => s.setFastingCardVisible
  );
  const cycleCardVisible = useAppPreferencesStore((s) => s.cycleCardVisible);
  const setCycleCardVisible = useAppPreferencesStore(
    (s) => s.setCycleCardVisible
  );
  const hydrationCardVisible = useAppPreferencesStore(
    (s) => s.hydrationCardVisible
  );
  const setHydrationCardVisible = useAppPreferencesStore(
    (s) => s.setHydrationCardVisible
  );
  const caffeineCardVisible = useAppPreferencesStore(
    (s) => s.caffeineCardVisible
  );
  const setCaffeineCardVisible = useAppPreferencesStore(
    (s) => s.setCaffeineCardVisible
  );
  const askSparkyVisible = useAppPreferencesStore((s) => s.askSparkyVisible);
  const setAskSparkyVisible = useAppPreferencesStore(
    (s) => s.setAskSparkyVisible
  );
  const medicationsCardVisible = useAppPreferencesStore(
    (s) => s.medicationsCardVisible
  );
  const setMedicationsCardVisible = useAppPreferencesStore(
    (s) => s.setMedicationsCardVisible
  );
  const symptomsCardVisible = useAppPreferencesStore(
    (s) => s.symptomsCardVisible
  );
  const setSymptomsCardVisible = useAppPreferencesStore(
    (s) => s.setSymptomsCardVisible
  );
  const moodCardVisible = useAppPreferencesStore((s) => s.moodCardVisible);
  const setMoodCardVisible = useAppPreferencesStore(
    (s) => s.setMoodCardVisible
  );
  const progressPhotosCardVisible = useAppPreferencesStore(
    (s) => s.progressPhotosCardVisible
  );
  const setProgressPhotosCardVisible = useAppPreferencesStore(
    (s) => s.setProgressPhotosCardVisible
  );
  const healthTrendsCardVisible = useAppPreferencesStore(
    (s) => s.healthTrendsCardVisible
  );
  const setHealthTrendsCardVisible = useAppPreferencesStore(
    (s) => s.setHealthTrendsCardVisible
  );
  const mindfulnessCardVisible = useAppPreferencesStore(
    (s) => s.mindfulnessCardVisible
  );
  const setMindfulnessCardVisible = useAppPreferencesStore(
    (s) => s.setMindfulnessCardVisible
  );
  const oralCareCardVisible = useAppPreferencesStore(
    (s) => s.oralCareCardVisible
  );
  const setOralCareCardVisible = useAppPreferencesStore(
    (s) => s.setOralCareCardVisible
  );
  const labResultsCardVisible = useAppPreferencesStore(
    (s) => s.labResultsCardVisible
  );
  const setLabResultsCardVisible = useAppPreferencesStore(
    (s) => s.setLabResultsCardVisible
  );
  const trainingLoadCardVisible = useAppPreferencesStore(
    (s) => s.trainingLoadCardVisible
  );
  const setTrainingLoadCardVisible = useAppPreferencesStore(
    (s) => s.setTrainingLoadCardVisible
  );

  const pinnedMetricsCardVisible = useAppPreferencesStore(
    (s) => s.pinnedMetricsCardVisible
  );
  const setPinnedMetricsCardVisible = useAppPreferencesStore(
    (s) => s.setPinnedMetricsCardVisible
  );
  const activityRingsCardVisible = useAppPreferencesStore(
    (s) => s.activityRingsCardVisible
  );
  const setActivityRingsCardVisible = useAppPreferencesStore(
    (s) => s.setActivityRingsCardVisible
  );

  const dashboardCardOrder = useAppPreferencesStore(
    (s) => s.dashboardCardOrder
  );
  const setDashboardCardOrder = useAppPreferencesStore(
    (s) => s.setDashboardCardOrder
  );

  const workoutsCardVisible = useAppPreferencesStore(
    (s) => s.workoutsCardVisible
  );
  const setWorkoutsCardVisible = useAppPreferencesStore(
    (s) => s.setWorkoutsCardVisible
  );
  const mealsCardVisible = useAppPreferencesStore((s) => s.mealsCardVisible);
  const setMealsCardVisible = useAppPreferencesStore(
    (s) => s.setMealsCardVisible
  );
  const sleepCardVisible = useAppPreferencesStore((s) => s.sleepCardVisible);
  const setSleepCardVisible = useAppPreferencesStore(
    (s) => s.setSleepCardVisible
  );
  const readinessCardVisible = useAppPreferencesStore(
    (s) => s.readinessCardVisible
  );
  const setReadinessCardVisible = useAppPreferencesStore(
    (s) => s.setReadinessCardVisible
  );
  const stepsCardVisible = useAppPreferencesStore((s) => s.stepsCardVisible);
  const setStepsCardVisible = useAppPreferencesStore(
    (s) => s.setStepsCardVisible
  );
  const heartRateCardVisible = useAppPreferencesStore(
    (s) => s.heartRateCardVisible
  );
  const setHeartRateCardVisible = useAppPreferencesStore(
    (s) => s.setHeartRateCardVisible
  );
  const dashboardTabsEnabled = useAppPreferencesStore(
    (s) => s.dashboardTabsEnabled
  );
  const setDashboardTabsEnabled = useAppPreferencesStore(
    (s) => s.setDashboardTabsEnabled
  );

  const savedSummaryCards = useAppPreferencesStore(
    (s) => s.dashboardSummaryCards
  );
  const setDashboardSummaryCards = useAppPreferencesStore(
    (s) => s.setDashboardSummaryCards
  );
  const dashboardTabCardOrders = useAppPreferencesStore(
    (s) => s.dashboardTabCardOrders
  );
  const setDashboardTabCardOrder = useAppPreferencesStore(
    (s) => s.setDashboardTabCardOrder
  );

  const orderedCards = useMemo(
    () => resolveDashboardCardOrder(dashboardCardOrder),
    [dashboardCardOrder]
  );

  const cardVisibilityMap: Record<DashboardCardKey, boolean> = {
    calorieRing: calorieRingCardVisible,
    askSparky: askSparkyVisible,
    macros: macrosCardVisible,
    exercise: exerciseCardVisible,
    activityRings: activityRingsCardVisible,
    pinnedMetrics: pinnedMetricsCardVisible,
    hydration: hydrationCardVisible,
    caffeine: caffeineCardVisible,
    fasting: fastingCardVisible,
    cycle: cycleCardVisible,
    medications: medicationsCardVisible,
    symptoms: symptomsCardVisible,
    mood: moodCardVisible,
    progressPhotos: progressPhotosCardVisible,
    healthTrends: healthTrendsCardVisible,
    mindfulness: mindfulnessCardVisible,
    oralCare: oralCareCardVisible,
    labResults: labResultsCardVisible,
    trainingLoad: trainingLoadCardVisible,
    workouts: workoutsCardVisible,
    meals: mealsCardVisible,
    sleep: sleepCardVisible,
    readiness: readinessCardVisible,
    steps: stepsCardVisible,
    heartRate: heartRateCardVisible,
  };

  const setCardVisibility = useCallback(
    (key: DashboardCardKey, isVisible: boolean) => {
      switch (key) {
        case 'calorieRing':
          setCalorieRingCardVisible(isVisible);
          break;
        case 'askSparky':
          setAskSparkyVisible(isVisible);
          break;
        case 'macros':
          setMacrosCardVisible(isVisible);
          break;
        case 'exercise':
          setExerciseCardVisible(isVisible);
          break;
        case 'hydration':
          setHydrationCardVisible(isVisible);
          break;
        case 'caffeine':
          setCaffeineCardVisible(isVisible);
          break;
        case 'fasting':
          setFastingCardVisible(isVisible);
          break;
        case 'cycle':
          setCycleCardVisible(isVisible);
          break;
        case 'medications':
          setMedicationsCardVisible(isVisible);
          break;
        case 'symptoms':
          setSymptomsCardVisible(isVisible);
          break;
        case 'mood':
          setMoodCardVisible(isVisible);
          break;
        case 'progressPhotos':
          setProgressPhotosCardVisible(isVisible);
          break;
        case 'healthTrends':
          setHealthTrendsCardVisible(isVisible);
          break;
        case 'mindfulness':
          setMindfulnessCardVisible(isVisible);
          break;
        case 'oralCare':
          setOralCareCardVisible(isVisible);
          break;
        case 'labResults':
          setLabResultsCardVisible(isVisible);

        case 'activityRings':
          setActivityRingsCardVisible(isVisible);
          break;
        case 'pinnedMetrics':
          setPinnedMetricsCardVisible(isVisible);
          break;
        case 'trainingLoad':
          setTrainingLoadCardVisible(isVisible);
          break;
        case 'workouts':
          setWorkoutsCardVisible(isVisible);
          break;
        case 'meals':
          setMealsCardVisible(isVisible);
          break;
        case 'sleep':
          setSleepCardVisible(isVisible);
          break;
        case 'readiness':
          setReadinessCardVisible(isVisible);
          break;
        case 'steps':
          setStepsCardVisible(isVisible);
          break;
        case 'heartRate':
          setHeartRateCardVisible(isVisible);
          break;
      }
    },
    [
      setCalorieRingCardVisible,
      setAskSparkyVisible,
      setMacrosCardVisible,
      setExerciseCardVisible,
      setActivityRingsCardVisible,
      setPinnedMetricsCardVisible,
      setHydrationCardVisible,
      setCaffeineCardVisible,
      setFastingCardVisible,
      setCycleCardVisible,
      setMedicationsCardVisible,
      setSymptomsCardVisible,
      setMoodCardVisible,
      setProgressPhotosCardVisible,
      setHealthTrendsCardVisible,
      setMindfulnessCardVisible,
      setOralCareCardVisible,
      setLabResultsCardVisible,
      setTrainingLoadCardVisible,
      setWorkoutsCardVisible,
      setMealsCardVisible,
      setSleepCardVisible,
      setReadinessCardVisible,
      setStepsCardVisible,
      setHeartRateCardVisible,
    ]
  );

  const summaryCards = useMemo(
    () => resolveSummaryCards(savedSummaryCards),
    [savedSummaryCards]
  );
  // Summary's own cards first, in its order, then every other card that could join it.
  const summaryRows = useMemo(
    () => [
      ...summaryCards,
      ...orderedCards.filter(
        (key) => key !== 'askSparky' && !summaryCards.includes(key)
      ),
    ],
    [summaryCards, orderedCards]
  );
  const toggleSummaryCard = useCallback(
    (key: DashboardCardKey, enabled: boolean) => {
      // At a Glance lives on Summary, so its switch there is its only switch.
      if (homeTabOf(key) === 'summary') {
        setCardVisibility(key, enabled);
        return;
      }
      setDashboardSummaryCards(
        enabled
          ? [...summaryCards.filter((k) => k !== key), key]
          : summaryCards.filter((k) => k !== key)
      );
    },
    [setCardVisibility, setDashboardSummaryCards, summaryCards]
  );
  const summarySubtitle = (key: DashboardCardKey): string => {
    const home = homeTabOf(key);
    if (home == null || home === 'summary') {
      return DASHBOARD_CARD_SUBTITLES[key](t);
    }
    const tab = DASHBOARD_TAB_LABELS[home](t);
    if (!cardVisibilityMap[key]) {
      return t('dashboardSettings.turnedOffOnTab', {
        defaultValue: 'Turned off on {{tab}}',
        tab,
      });
    }
    return summaryCards.includes(key)
      ? t('dashboardSettings.alsoOnTab', {
          defaultValue: 'Also on {{tab}}',
          tab,
        })
      : t('dashboardSettings.onTabOnly', {
          defaultValue: 'On {{tab}} only',
          tab,
        });
  };
  const configureFor = useCallback(
    (key: DashboardCardKey) => {
      switch (key) {
        case 'healthTrends':
          return () => navigation.navigate('HealthTrendsSettings');
        case 'activityRings':
          return () => navigation.navigate('ActivityRingsSettings');
        case 'pinnedMetrics':
          return () => navigation.navigate('PinnedMetricsSettings');
        default:
          return undefined;
      }
    },
    [navigation]
  );

  const queryClient = useQueryClient();
  const { isConnected } = useServerConnection();
  const { customNutrients, isLoading: isCustomLoading } = useCustomNutrients({
    enabled: isConnected,
  });
  const { preferences, isLoading: isPrefsLoading } =
    useNutrientDisplayPreferences({ enabled: isConnected });

  const isLoading = isConnected && (isCustomLoading || isPrefsLoading);

  // Base array is the raw summary/mobile row (NOT the summaryNutrients getter,
  // which strips 'calories' — using it as the merge base would silently drop
  // calories from the stored row on every PUT). The server guarantees this row
  // exists once preferences resolve; the default is defensive only.
  const summaryRow = preferences.find(
    (p) => p.view_group === SUMMARY_VIEW_GROUP && p.platform === MOBILE_PLATFORM
  );
  const base =
    summaryRow?.visible_nutrients ?? SERVER_DEFAULT_SUMMARY_NUTRIENTS;

  const mutation = useMutation({
    mutationFn: (visibleNutrients: string[]) =>
      updateNutrientDisplayPreference(
        SUMMARY_VIEW_GROUP,
        MOBILE_PLATFORM,
        visibleNutrients
      ),
    onMutate: async (visibleNutrients) => {
      await queryClient.cancelQueries({
        queryKey: nutrientDisplayPreferencesQueryKey,
      });
      const previous = queryClient.getQueryData<NutrientDisplayPreference[]>(
        nutrientDisplayPreferencesQueryKey
      );
      queryClient.setQueryData<NutrientDisplayPreference[]>(
        nutrientDisplayPreferencesQueryKey,
        (old = []) => {
          const idx = old.findIndex(
            (p) =>
              p.view_group === SUMMARY_VIEW_GROUP &&
              p.platform === MOBILE_PLATFORM
          );
          if (idx >= 0) {
            return old.map((p, i) =>
              i === idx ? { ...p, visible_nutrients: visibleNutrients } : p
            );
          }
          return [
            ...old,
            {
              view_group: SUMMARY_VIEW_GROUP,
              platform: MOBILE_PLATFORM,
              visible_nutrients: visibleNutrients,
            },
          ];
        }
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          nutrientDisplayPreferencesQueryKey,
          context.previous
        );
      }
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('dashboardSettings.updateFailed', {
          defaultValue: 'Failed to update setting.',
        }),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: nutrientDisplayPreferencesQueryKey,
      });
    },
  });

  const handleToggle = useCallback(
    (name: string, value: boolean) => {
      mutation.mutate(toggleNutrientVisibility(base, name, value));
    },
    [base, mutation]
  );

  const renderContent = () => {
    if (isLoading) {
      return <StatusView inline loading />;
    }

    if (customNutrients.length === 0) {
      return (
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <Text className="text-base font-semibold text-text-primary mb-2">
            {t('dashboardSettings.noCustomNutrients', {
              defaultValue: 'No custom nutrients',
            })}
          </Text>
          <Text className="text-text-secondary text-sm">
            {t('dashboardSettings.customNutrientsDescription', {
              defaultValue:
                'Add custom nutrients in Settings > Food Settings > Custom Nutrients. Once you add some, they will appear here so you can choose which show on your Dashboard.',
            })}
          </Text>
        </View>
      );
    }

    return (
      <SettingsRowGroup>
        {customNutrients.map((cn) => (
          <SettingsRow
            key={cn.id}
            title={cn.name}
            subtitle={cn.unit}
            rightAccessory={
              <Switch
                accessibilityLabel={cn.name}
                value={base.includes(cn.name)}
                onValueChange={(value) => handleToggle(cn.name, value)}
              />
            }
          />
        ))}
      </SettingsRowGroup>
    );
  };

  const header = useScreenHeader({
    title: t('dashboardSettings.title', { defaultValue: 'Dashboard Settings' }),
    left: { kind: 'back' },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <SettingsRowGroup>
          <SettingsRow
            title={t('dashboardSettings.tabs', {
              defaultValue: 'Dashboard tabs',
            })}
            subtitle={t('dashboardSettings.tabsSubtitle', {
              defaultValue:
                'Split the Dashboard into Summary, Nutrition, Activity and Wellness',
            })}
            rightAccessory={
              <Switch
                testID="dashboard-tabs-switch"
                accessibilityLabel={t('dashboardSettings.tabs', {
                  defaultValue: 'Dashboard tabs',
                })}
                value={dashboardTabsEnabled}
                onValueChange={setDashboardTabsEnabled}
              />
            }
          />
        </SettingsRowGroup>

        {dashboardTabsEnabled ? (
          <>
            <SettingsRowGroup>
              <SettingsRow
                title={DASHBOARD_CARD_TITLES.askSparky(t)}
                subtitle={t('dashboardSettings.askSparkyOnEveryTab', {
                  defaultValue: 'At the top of every tab',
                })}
                rightAccessory={
                  <Switch
                    testID="dashboard-ask-sparky-switch"
                    accessibilityLabel={DASHBOARD_CARD_TITLES.askSparky(t)}
                    value={askSparkyVisible}
                    onValueChange={setAskSparkyVisible}
                  />
                }
              />
            </SettingsRowGroup>
            <Text className="text-text-secondary text-sm mt-6 mb-4">
              {t('dashboardSettings.tabsDescription', {
                defaultValue:
                  "Drag a card by its handle to reorder its tab. A card's own switch hides it everywhere; Summary has its own list of cards it repeats from the other tabs.",
              })}
            </Text>
            {DASHBOARD_TABS.map((tab) => (
              <View
                key={tab}
                className="mb-6"
                testID={`dashboard-tab-section-${tab}`}
              >
                <Text className="text-xs font-semibold uppercase text-text-muted mb-2 px-1">
                  {DASHBOARD_TAB_LABELS[tab](t)}
                </Text>
                {tab === 'summary' ? (
                  <DashboardCardReorderList
                    cards={summaryRows}
                    testIDPrefix="dashboard-summary-card"
                    subtitle={summarySubtitle}
                    isEnabled={(key) =>
                      homeTabOf(key) === 'summary'
                        ? cardVisibilityMap[key]
                        : summaryCards.includes(key)
                    }
                    onToggle={toggleSummaryCard}
                    onReorder={(order) =>
                      setDashboardSummaryCards(
                        order.filter((key) => summaryCards.includes(key))
                      )
                    }
                    onConfigure={configureFor}
                  />
                ) : (
                  <DashboardCardReorderList
                    cards={resolveHomeTabCards(
                      tab,
                      dashboardTabCardOrders[tab],
                      orderedCards
                    )}
                    testIDPrefix="dashboard-card"
                    subtitle={(key) => DASHBOARD_CARD_SUBTITLES[key](t)}
                    isEnabled={(key) => cardVisibilityMap[key]}
                    onToggle={setCardVisibility}
                    onReorder={(order) => setDashboardTabCardOrder(tab, order)}
                    onConfigure={configureFor}
                  />
                )}
              </View>
            ))}
          </>
        ) : (
          <>
            <Text className="text-text-secondary text-sm mb-4 mt-6">
              {t('dashboardSettings.description', {
                defaultValue:
                  'Drag a card by its handle to reorder your Dashboard. Toggle off to hide cards you do not use.',
              })}
            </Text>
            <View className="mb-6">
              <DashboardCardReorderList
                cards={orderedCards}
                testIDPrefix="dashboard-card"
                subtitle={(key) => DASHBOARD_CARD_SUBTITLES[key](t)}
                isEnabled={(key) => cardVisibilityMap[key]}
                onToggle={setCardVisibility}
                onReorder={setDashboardCardOrder}
                onConfigure={configureFor}
              />
            </View>
          </>
        )}

        <Text className="text-base font-semibold text-text-primary mb-4">
          {t('dashboardSettings.customNutrientDisplay', {
            defaultValue: 'Custom Nutrient Display',
          })}
        </Text>

        {renderContent()}
      </ScrollView>
    </View>
  );
};

export default DashboardSettingsScreen;
