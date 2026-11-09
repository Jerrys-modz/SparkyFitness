import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { View, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import NotificationPermissionBanner, {
  type NotificationPermissionBannerHandle,
} from '../components/NotificationPermissionBanner';
import ReminderRuleRow from '../components/ReminderRuleRow';
import SegmentedControl from '../components/SegmentedControl';
import TimeSheet, { type TimeSheetRef } from '../components/TimeSheet';
import Switch from '../components/ui/Switch';
import {
  maybePromptForExactAlarmPermission,
  requestNotificationPermission,
  setNotificationsEnabled,
  setRestTimerNotificationsEnabled,
} from '../services/notifications';
import {
  MEDICATION_REMINDER_SNOOZE_OPTIONS,
  WATER_REMINDER_INTERVAL_OPTIONS,
  useAppPreferencesStore,
  type MedicationReminderSnoozeMinutes,
  type WaterReminderIntervalHours,
} from '../stores/appPreferencesStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import { markCheckinReminderOfferShown } from '../services/checkinReminderOffer';
import {
  MAX_CHECKIN_REMINDERS,
  MAX_ORAL_CARE_REMINDERS,
} from '../utils/checkinReminderTimes';
import { MAX_MEAL_REMINDERS } from '../utils/mealReminders';
import { useMealTypes } from '../hooks/useMealTypes';
import {
  DEFAULT_MACRO_ALERT_PERCENT,
  DEFAULT_MACRO_ALERT_TIME,
  MACRO_ALERT_KEYS,
  MACRO_ALERT_PERCENTS,
  type MacroAlertKey,
  type MacroAlertPercent,
} from '../utils/macroAlerts';
import { formatTimeLabel } from '../utils/entryTimeDisplay';
import { useReminderTimeRows } from '../components/ReminderTimeRows';
import { isValidReminderWindow } from '../utils/hydrationReminder';
import type { RootStackScreenProps } from '../types/navigation';

type IntervalKey = `${WaterReminderIntervalHours}`;
type SnoozeMinutesKey = `${MedicationReminderSnoozeMinutes}`;

type NotificationSettingsScreenProps =
  RootStackScreenProps<'NotificationSettings'>;

const NotificationSettingsScreen: React.FC<
  NotificationSettingsScreenProps
> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const notificationsEnabled = useAppPreferencesStore(
    (s) => s.notificationsEnabled
  );
  const restTimerNotificationsEnabled = useAppPreferencesStore(
    (s) => s.restTimerNotificationsEnabled
  );
  const fastingGoalNotificationsEnabled = useAppPreferencesStore(
    (s) => s.fastingGoalNotificationsEnabled
  );
  const setFastingGoalNotificationsEnabled = useAppPreferencesStore(
    (s) => s.setFastingGoalNotificationsEnabled
  );
  const medicationRemindersEnabled = useAppPreferencesStore(
    (s) => s.medicationRemindersEnabled
  );
  const setMedicationRemindersEnabled = useAppPreferencesStore(
    (s) => s.setMedicationRemindersEnabled
  );
  const medicationReminderRepeats = useAppPreferencesStore(
    (s) => s.medicationReminderRepeats
  );
  const setMedicationReminderRepeats = useAppPreferencesStore(
    (s) => s.setMedicationReminderRepeats
  );
  const medicationReminderHideNames = useAppPreferencesStore(
    (s) => s.medicationReminderHideNames
  );
  const setMedicationReminderHideNames = useAppPreferencesStore(
    (s) => s.setMedicationReminderHideNames
  );
  const medicationReminderConsolidate = useAppPreferencesStore(
    (s) => s.medicationReminderConsolidate
  );
  const setMedicationReminderConsolidate = useAppPreferencesStore(
    (s) => s.setMedicationReminderConsolidate
  );
  const medicationReminderSnoozeMinutes = useAppPreferencesStore(
    (s) => s.medicationReminderSnoozeMinutes
  );
  const setMedicationReminderSnoozeMinutes = useAppPreferencesStore(
    (s) => s.setMedicationReminderSnoozeMinutes
  );
  const waterReminderEnabled = useAppPreferencesStore(
    (s) => s.waterReminderEnabled
  );
  const setWaterReminderEnabled = useAppPreferencesStore(
    (s) => s.setWaterReminderEnabled
  );
  const waterReminderIntervalHours = useAppPreferencesStore(
    (s) => s.waterReminderIntervalHours
  );
  const setWaterReminderIntervalHours = useAppPreferencesStore(
    (s) => s.setWaterReminderIntervalHours
  );
  const waterReminderWindowStart = useAppPreferencesStore(
    (s) => s.waterReminderWindowStart
  );
  const waterReminderWindowEnd = useAppPreferencesStore(
    (s) => s.waterReminderWindowEnd
  );
  const setWaterReminderWindow = useAppPreferencesStore(
    (s) => s.setWaterReminderWindow
  );
  const checkinRemindersEnabled = useAppPreferencesStore(
    (s) => s.checkinRemindersEnabled
  );
  const setCheckinRemindersEnabled = useAppPreferencesStore(
    (s) => s.setCheckinRemindersEnabled
  );
  const checkinReminderTimes = useAppPreferencesStore(
    (s) => s.checkinReminderTimes
  );
  const setCheckinReminderTimes = useAppPreferencesStore(
    (s) => s.setCheckinReminderTimes
  );
  const mealRemindersEnabled = useAppPreferencesStore(
    (s) => s.mealRemindersEnabled
  );
  const setMealRemindersEnabled = useAppPreferencesStore(
    (s) => s.setMealRemindersEnabled
  );
  const mealReminders = useAppPreferencesStore((s) => s.mealReminders);
  const setMealReminders = useAppPreferencesStore((s) => s.setMealReminders);
  const { mealTypes } = useMealTypes({ enabled: mealRemindersEnabled });
  const macroAlertsEnabled = useAppPreferencesStore(
    (s) => s.macroAlertsEnabled
  );
  const setMacroAlertsEnabled = useAppPreferencesStore(
    (s) => s.setMacroAlertsEnabled
  );
  const macroAlertRules = useAppPreferencesStore((s) => s.macroAlertRules);
  const setMacroAlertRules = useAppPreferencesStore(
    (s) => s.setMacroAlertRules
  );
  const macroTimeSheetRef = useRef<TimeSheetRef>(null);
  const [editingMacro, setEditingMacro] = useState<{
    macro: MacroAlertKey;
    nonce: number;
  } | null>(null);
  const mealTimeSheetRef = useRef<TimeSheetRef>(null);
  const [editingMealTypeId, setEditingMealTypeId] = useState<{
    mealTypeId: string;
    nonce: number;
  } | null>(null);
  const { preferences } = usePreferences();
  const startTimeSheetRef = useRef<TimeSheetRef>(null);
  const endTimeSheetRef = useRef<TimeSheetRef>(null);
  const usesNativeHeader = useNativeIOSHeadersActive();
  const bannerRef = useRef<NotificationPermissionBannerHandle>(null);

  const handleNotificationsToggle = useCallback(async (value: boolean) => {
    if (!value) {
      await setNotificationsEnabled(false);
      return;
    }
    // Ask first: switching on without permission would let reminders be
    // rescheduled (and cancelled) before the grant arrives, and a denial
    // would leave the toggle showing on. The banner explains a denial.
    const status = await requestNotificationPermission();
    bannerRef.current?.refresh();
    if (status === 'granted') await setNotificationsEnabled(true);
  }, []);

  const handleMedicationRemindersToggle = useCallback(
    async (value: boolean) => {
      if (!value) {
        setMedicationRemindersEnabled(false);
        return;
      }
      const status = await requestNotificationPermission();
      bannerRef.current?.refresh();
      // Without OS permission the toggle would show "on" while reminders
      // silently never fire; leave it off until permission is granted. The
      // permission banner above explains and links to system settings.
      if (status === 'granted') {
        setMedicationRemindersEnabled(true);
        // Scheduled reminders ring late on Android without the exact-alarm
        // special access; nudge once when the user opts in.
        await maybePromptForExactAlarmPermission();
      }
    },
    [setMedicationRemindersEnabled]
  );

  const handleWaterRemindersToggle = useCallback(
    async (value: boolean) => {
      if (!value) {
        setWaterReminderEnabled(false);
        return;
      }
      const status = await requestNotificationPermission();
      bannerRef.current?.refresh();
      // Same rule as medication reminders: never show "on" while the OS would
      // silently drop every reminder.
      if (status === 'granted') setWaterReminderEnabled(true);
    },
    [setWaterReminderEnabled]
  );

  const handleCheckinRemindersToggle = useCallback(
    async (value: boolean) => {
      // Whoever uses this toggle has made their choice; skip the one-time offer.
      void markCheckinReminderOfferShown();
      if (!value) {
        setCheckinRemindersEnabled(false);
        return;
      }
      const status = await requestNotificationPermission();
      bannerRef.current?.refresh();
      // Same rule as the other reminders: never show "on" while the OS would
      // silently drop every reminder.
      if (status === 'granted') setCheckinRemindersEnabled(true);
    },
    [setCheckinRemindersEnabled]
  );

  const macroLabels = useMemo<Record<MacroAlertKey, string>>(
    () => ({
      protein: t('nutrients.protein', { defaultValue: 'Protein' }),
      carbs: t('nutrients.carbs', { defaultValue: 'Carbs' }),
      fat: t('nutrients.fat', { defaultValue: 'Fat' }),
      fiber: t('nutrients.fiber', { defaultValue: 'Fiber' }),
      calories: t('nutrients.calories', { defaultValue: 'Calories' }),
    }),
    [t]
  );
  const macroPercentSegments = useMemo(
    () =>
      MACRO_ALERT_PERCENTS.map((percent) => ({
        key: String(percent),
        label: `${percent}%`,
      })),
    []
  );

  const handleMacroAlertsToggle = useCallback(
    async (value: boolean) => {
      if (!value) {
        setMacroAlertsEnabled(false);
        return;
      }
      const status = await requestNotificationPermission();
      bannerRef.current?.refresh();
      if (status === 'granted') {
        setMacroAlertsEnabled(true);
        if (macroAlertRules.length === 0) {
          setMacroAlertRules([
            {
              macro: 'protein',
              percent: DEFAULT_MACRO_ALERT_PERCENT,
              time: DEFAULT_MACRO_ALERT_TIME,
            },
          ]);
        }
      }
    },
    [macroAlertRules.length, setMacroAlertRules, setMacroAlertsEnabled]
  );

  useEffect(() => {
    if (editingMacro) macroTimeSheetRef.current?.present();
  }, [editingMacro]);

  const openMacroTimeSheet = useCallback((macro: MacroAlertKey) => {
    setEditingMacro((prev) => ({ macro, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const handleMacroTimeSelect = useCallback(
    (time: string) => {
      if (!editingMacro) return;
      setMacroAlertRules(
        macroAlertRules.map((r) =>
          r.macro === editingMacro.macro ? { ...r, time } : r
        )
      );
    },
    [editingMacro, macroAlertRules, setMacroAlertRules]
  );

  const handleMacroPercentSelect = useCallback(
    (macro: MacroAlertKey, percent: MacroAlertPercent) => {
      setMacroAlertRules(
        macroAlertRules.map((r) => (r.macro === macro ? { ...r, percent } : r))
      );
    },
    [macroAlertRules, setMacroAlertRules]
  );

  const handleChangeMacroAlertMacro = useCallback(
    (from: MacroAlertKey, to: MacroAlertKey) => {
      if (from === to) return;
      setMacroAlertRules(
        macroAlertRules.map((r) => (r.macro === from ? { ...r, macro: to } : r))
      );
    },
    [macroAlertRules, setMacroAlertRules]
  );

  const handleRemoveMacroAlert = useCallback(
    (macro: MacroAlertKey) => {
      setMacroAlertRules(macroAlertRules.filter((r) => r.macro !== macro));
    },
    [macroAlertRules, setMacroAlertRules]
  );

  const nextUnruledMacro = MACRO_ALERT_KEYS.find(
    (macro) => !macroAlertRules.some((r) => r.macro === macro)
  );

  const handleAddMacroAlert = useCallback(() => {
    if (!nextUnruledMacro) return;
    setMacroAlertRules([
      ...macroAlertRules,
      {
        macro: nextUnruledMacro,
        percent: DEFAULT_MACRO_ALERT_PERCENT,
        time: DEFAULT_MACRO_ALERT_TIME,
      },
    ]);
  }, [nextUnruledMacro, macroAlertRules, setMacroAlertRules]);

  const handleMealRemindersToggle = useCallback(
    async (value: boolean) => {
      if (!value) {
        setMealRemindersEnabled(false);
        return;
      }
      const status = await requestNotificationPermission();
      bannerRef.current?.refresh();
      // Same rule as the other reminders: never show "on" while the OS would
      // silently drop every reminder.
      if (status === 'granted') setMealRemindersEnabled(true);
    },
    [setMealRemindersEnabled]
  );

  useEffect(() => {
    if (editingMealTypeId) mealTimeSheetRef.current?.present();
  }, [editingMealTypeId]);

  const openMealTimeSheet = useCallback((mealTypeId: string) => {
    setEditingMealTypeId((prev) => ({
      mealTypeId,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  }, []);

  const handleMealTimeSelect = useCallback(
    (time: string) => {
      if (!editingMealTypeId) return;
      setMealReminders(
        mealReminders.map((r) =>
          r.mealTypeId === editingMealTypeId.mealTypeId ? { ...r, time } : r
        )
      );
    },
    [editingMealTypeId, mealReminders, setMealReminders]
  );

  const handleChangeMealReminderMeal = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      setMealReminders(
        mealReminders.map((r) =>
          r.mealTypeId === fromId ? { ...r, mealTypeId: toId } : r
        )
      );
    },
    [mealReminders, setMealReminders]
  );

  const handleRemoveMealReminder = useCallback(
    (mealTypeId: string) => {
      setMealReminders(
        mealReminders.filter((r) => r.mealTypeId !== mealTypeId)
      );
    },
    [mealReminders, setMealReminders]
  );

  const nextUnremindedMeal = mealTypes.find(
    (m) => !mealReminders.some((r) => r.mealTypeId === m.id)
  );

  const handleAddMealReminder = useCallback(() => {
    if (!nextUnremindedMeal) return;
    setMealReminders([
      ...mealReminders,
      { mealTypeId: nextUnremindedMeal.id, time: '12:00' },
    ]);
    openMealTimeSheet(nextUnremindedMeal.id);
  }, [nextUnremindedMeal, mealReminders, setMealReminders, openMealTimeSheet]);

  const oralCareRemindersEnabled = useAppPreferencesStore(
    (s) => s.oralCareRemindersEnabled
  );
  const setOralCareRemindersEnabled = useAppPreferencesStore(
    (s) => s.setOralCareRemindersEnabled
  );
  const oralCareReminderTimes = useAppPreferencesStore(
    (s) => s.oralCareReminderTimes
  );
  const setOralCareReminderTimes = useAppPreferencesStore(
    (s) => s.setOralCareReminderTimes
  );

  const handleOralCareRemindersToggle = useCallback(
    async (value: boolean) => {
      if (!value) {
        setOralCareRemindersEnabled(false);
        return;
      }
      const status = await requestNotificationPermission();
      bannerRef.current?.refresh();
      if (status === 'granted') setOralCareRemindersEnabled(true);
    },
    [setOralCareRemindersEnabled]
  );

  const oralCareReminderRows = useReminderTimeRows({
    times: oralCareReminderTimes,
    onChangeTimes: setOralCareReminderTimes,
    maxTimes: MAX_ORAL_CARE_REMINDERS,
    timeFormat: preferences?.time_format,
    labels: {
      reminder: (number) =>
        t('notificationSettings.oralCareReminderTime', {
          defaultValue: 'Reminder {{number}}',
          number,
        }),
      reminderA11y: (number, time) =>
        t('notificationSettings.oralCareReminderTimeAccessibility', {
          defaultValue: 'Brushing reminder {{number}}, {{time}}',
          number,
          time,
        }),
      remove: (number) =>
        t('notificationSettings.oralCareRemoveReminder', {
          defaultValue: 'Remove brushing reminder {{number}}',
          number,
        }),
      add: t('notificationSettings.oralCareAddReminder', {
        defaultValue: 'Add reminder',
      }),
    },
  });

  const checkinReminderRows = useReminderTimeRows({
    times: checkinReminderTimes,
    onChangeTimes: setCheckinReminderTimes,
    maxTimes: MAX_CHECKIN_REMINDERS,
    timeFormat: preferences?.time_format,
    labels: {
      reminder: (number) =>
        t('notificationSettings.moodCheckinReminderTime', {
          defaultValue: 'Reminder {{number}}',
          number,
        }),
      reminderA11y: (number, time) =>
        t('notificationSettings.moodCheckinReminderTimeAccessibility', {
          defaultValue: 'Reminder {{number}}, {{time}}',
          number,
          time,
        }),
      remove: (number) =>
        t('notificationSettings.moodCheckinRemoveReminder', {
          defaultValue: 'Remove reminder {{number}}',
          number,
        }),
      add: t('notificationSettings.moodCheckinAddReminder', {
        defaultValue: 'Add reminder',
      }),
    },
  });

  const intervalSegments = useMemo(
    () =>
      WATER_REMINDER_INTERVAL_OPTIONS.map((hours) => ({
        key: String(hours) as IntervalKey,
        label: t('notificationSettings.waterReminderIntervalOption', {
          defaultValue: '{{hours}}h',
          hours,
        }),
      })),
    [t]
  );

  const handleIntervalSelect = useCallback(
    (key: IntervalKey) => {
      setWaterReminderIntervalHours(Number(key) as WaterReminderIntervalHours);
    },
    [setWaterReminderIntervalHours]
  );

  const showInvalidWindowToast = useCallback(() => {
    Toast.show({
      type: 'error',
      text1: t('notificationSettings.waterReminderInvalidWindow', {
        defaultValue: 'End time must be after start time.',
      }),
    });
  }, [t]);

  const handleStartTimeSelect = useCallback(
    (time: string) => {
      if (!isValidReminderWindow(time, waterReminderWindowEnd)) {
        showInvalidWindowToast();
        return;
      }
      setWaterReminderWindow(time, waterReminderWindowEnd);
    },
    [waterReminderWindowEnd, setWaterReminderWindow, showInvalidWindowToast]
  );

  const handleEndTimeSelect = useCallback(
    (time: string) => {
      if (!isValidReminderWindow(waterReminderWindowStart, time)) {
        showInvalidWindowToast();
        return;
      }
      setWaterReminderWindow(waterReminderWindowStart, time);
    },
    [waterReminderWindowStart, setWaterReminderWindow, showInvalidWindowToast]
  );

  const startTimeLabel =
    formatTimeLabel(waterReminderWindowStart, preferences?.time_format) ??
    waterReminderWindowStart;
  const endTimeLabel =
    formatTimeLabel(waterReminderWindowEnd, preferences?.time_format) ??
    waterReminderWindowEnd;

  const snoozeSegments = useMemo(
    () =>
      MEDICATION_REMINDER_SNOOZE_OPTIONS.map((minutes) => ({
        key: String(minutes) as SnoozeMinutesKey,
        label: t('notificationSettings.snoozeMinutesOption', {
          defaultValue: '{{minutes}}m',
          minutes,
        }),
      })),
    [t]
  );

  const header = useScreenHeader({
    title: t('notificationSettings.title', { defaultValue: 'Notifications' }),
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
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <SettingsRow
          title={t('notificationSettings.allow', {
            defaultValue: 'Allow Notifications',
          })}
          subtitle={t('notificationSettings.allowSubtitle', {
            defaultValue: 'Master switch for all alerts from SparkyFitness.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              accessibilityLabel={t('notificationSettings.allow', {
                defaultValue: 'Allow Notifications',
              })}
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
            />
          }
        />

        <NotificationPermissionBanner ref={bannerRef} />

        {notificationsEnabled && (
          <SettingsRowGroup
            title={t('notificationSettings.alerts', { defaultValue: 'Alerts' })}
          >
            <SettingsRow
              title={t('notificationSettings.restTimer', {
                defaultValue: 'Rest Timer',
              })}
              subtitle={t('notificationSettings.restTimerSubtitle', {
                defaultValue:
                  'Alert when a rest period ends, even in the background.',
              })}
              subtitleNumberOfLines={0}
              rightAccessory={
                <Switch
                  accessibilityLabel={t('notificationSettings.restTimer', {
                    defaultValue: 'Rest Timer',
                  })}
                  value={restTimerNotificationsEnabled}
                  onValueChange={(value) =>
                    void setRestTimerNotificationsEnabled(value)
                  }
                />
              }
            />
            <SettingsRow
              title={t('notificationSettings.fastingGoals', {
                defaultValue: 'Fasting Goals',
              })}
              subtitle={t('notificationSettings.fastingGoalsSubtitle', {
                defaultValue: 'Alert when you reach your fasting goal.',
              })}
              subtitleNumberOfLines={0}
              rightAccessory={
                <Switch
                  accessibilityLabel={t('notificationSettings.fastingGoals', {
                    defaultValue: 'Fasting Goals',
                  })}
                  value={fastingGoalNotificationsEnabled}
                  onValueChange={setFastingGoalNotificationsEnabled}
                />
              }
            />
          </SettingsRowGroup>
        )}

        {notificationsEnabled && (
          <SettingsRowGroup
            title={t('notificationSettings.medications', {
              defaultValue: 'Medications',
            })}
          >
            <SettingsRow
              title={t('notificationSettings.medicationReminders', {
                defaultValue: 'Medication Reminders',
              })}
              subtitle={t('notificationSettings.medicationRemindersSubtitle', {
                defaultValue: 'Reminders for scheduled medications.',
              })}
              subtitleNumberOfLines={0}
              rightAccessory={
                <Switch
                  accessibilityLabel={t(
                    'notificationSettings.medicationReminders',
                    { defaultValue: 'Medication Reminders' }
                  )}
                  value={medicationRemindersEnabled}
                  onValueChange={handleMedicationRemindersToggle}
                />
              }
            />
            {medicationRemindersEnabled && (
              <SettingsRow
                title={t('notificationSettings.repeatReminders', {
                  defaultValue: 'Repeat Reminders',
                })}
                subtitle={t('notificationSettings.repeatRemindersSubtitle', {
                  defaultValue:
                    'Repeat each reminder every 10 minutes, up to 3 times, until the dose is logged.',
                })}
                subtitleNumberOfLines={0}
                rightAccessory={
                  <Switch
                    accessibilityLabel={t(
                      'notificationSettings.repeatReminders',
                      { defaultValue: 'Repeat Reminders' }
                    )}
                    value={medicationReminderRepeats}
                    onValueChange={setMedicationReminderRepeats}
                  />
                }
              />
            )}
            {medicationRemindersEnabled && (
              <SettingsRow
                title={t('notificationSettings.hideMedicationNames', {
                  defaultValue: 'Hide Medication Names',
                })}
                subtitle={t(
                  'notificationSettings.hideMedicationNamesSubtitle',
                  {
                    defaultValue:
                      'Show a generic reminder instead of the medication name and dose.',
                  }
                )}
                subtitleNumberOfLines={0}
                rightAccessory={
                  <Switch
                    accessibilityLabel={t(
                      'notificationSettings.hideMedicationNames',
                      { defaultValue: 'Hide Medication Names' }
                    )}
                    value={medicationReminderHideNames}
                    onValueChange={setMedicationReminderHideNames}
                  />
                }
              />
            )}
            {medicationRemindersEnabled && (
              <SettingsRow
                title={t('notificationSettings.consolidateReminders', {
                  defaultValue: 'Consolidate Reminders',
                })}
                subtitle={t(
                  'notificationSettings.consolidateRemindersSubtitle',
                  {
                    defaultValue:
                      'Group medications scheduled for the same time into a single notification.',
                  }
                )}
                subtitleNumberOfLines={0}
                rightAccessory={
                  <Switch
                    accessibilityLabel={t(
                      'notificationSettings.consolidateReminders',
                      { defaultValue: 'Consolidate Reminders' }
                    )}
                    value={medicationReminderConsolidate}
                    onValueChange={setMedicationReminderConsolidate}
                  />
                }
              />
            )}
            {medicationRemindersEnabled && (
              <SettingsRow
                title={t('notificationSettings.medicationSnoozeInterval', {
                  defaultValue: 'Remind In',
                })}
                subtitle={
                  <View className="mt-2">
                    <SegmentedControl
                      segments={snoozeSegments}
                      activeKey={
                        String(
                          medicationReminderSnoozeMinutes
                        ) as SnoozeMinutesKey
                      }
                      onSelect={(key) =>
                        setMedicationReminderSnoozeMinutes(
                          Number(key) as MedicationReminderSnoozeMinutes
                        )
                      }
                    />
                  </View>
                }
              />
            )}
          </SettingsRowGroup>
        )}

        {notificationsEnabled && (
          <SettingsRowGroup
            title={t('notificationSettings.hydration', {
              defaultValue: 'Hydration',
            })}
          >
            <SettingsRow
              title={t('notificationSettings.waterReminders', {
                defaultValue: 'Water Reminders',
              })}
              subtitle={t('notificationSettings.waterRemindersSubtitle', {
                defaultValue:
                  "Remind you to drink when you haven't logged water in a while.",
              })}
              subtitleNumberOfLines={0}
              rightAccessory={
                <Switch
                  accessibilityLabel={t('notificationSettings.waterReminders', {
                    defaultValue: 'Water Reminders',
                  })}
                  value={waterReminderEnabled}
                  onValueChange={handleWaterRemindersToggle}
                />
              }
            />
            {waterReminderEnabled && (
              <SettingsRow
                title={t('notificationSettings.waterReminderInterval', {
                  defaultValue: 'Remind After',
                })}
                subtitle={
                  <View className="mt-2">
                    <SegmentedControl
                      segments={intervalSegments}
                      activeKey={
                        String(waterReminderIntervalHours) as IntervalKey
                      }
                      onSelect={handleIntervalSelect}
                    />
                  </View>
                }
              />
            )}
            {waterReminderEnabled && (
              <SettingsRow
                title={t('notificationSettings.waterReminderStart', {
                  defaultValue: 'Start Time',
                })}
                onPress={() => startTimeSheetRef.current?.present()}
                accessibilityLabel={t(
                  'notificationSettings.waterReminderStartAccessibility',
                  { defaultValue: 'Start time, {{time}}', time: startTimeLabel }
                )}
                rightAccessory={
                  <Text className="text-sm text-text-secondary">
                    {startTimeLabel}
                  </Text>
                }
              />
            )}
            {waterReminderEnabled && (
              <SettingsRow
                title={t('notificationSettings.waterReminderEnd', {
                  defaultValue: 'End Time',
                })}
                onPress={() => endTimeSheetRef.current?.present()}
                accessibilityLabel={t(
                  'notificationSettings.waterReminderEndAccessibility',
                  { defaultValue: 'End time, {{time}}', time: endTimeLabel }
                )}
                rightAccessory={
                  <Text className="text-sm text-text-secondary">
                    {endTimeLabel}
                  </Text>
                }
              />
            )}
          </SettingsRowGroup>
        )}

        {notificationsEnabled && (
          <SettingsRowGroup
            title={t('notificationSettings.moodCheckins', {
              defaultValue: 'Mood check-ins',
            })}
          >
            <SettingsRow
              title={t('notificationSettings.moodCheckinReminders', {
                defaultValue: 'Check-in reminders',
              })}
              subtitle={t('notificationSettings.moodCheckinRemindersSubtitle', {
                defaultValue: 'A daily nudge to log how you feel',
              })}
              subtitleNumberOfLines={0}
              rightAccessory={
                <Switch
                  accessibilityLabel={t(
                    'notificationSettings.moodCheckinReminders',
                    { defaultValue: 'Check-in reminders' }
                  )}
                  value={checkinRemindersEnabled}
                  onValueChange={handleCheckinRemindersToggle}
                />
              }
            />
            {checkinRemindersEnabled && checkinReminderRows.rows}
          </SettingsRowGroup>
        )}

        {notificationsEnabled && (
          <SettingsRowGroup
            title={t('notificationSettings.oralCare', {
              defaultValue: 'Oral care',
            })}
          >
            <SettingsRow
              title={t('notificationSettings.oralCareReminders', {
                defaultValue: 'Brushing reminders',
              })}
              subtitle={t('notificationSettings.oralCareRemindersSubtitle', {
                defaultValue: 'A daily nudge to brush your teeth',
              })}
              subtitleNumberOfLines={0}
              rightAccessory={
                <Switch
                  accessibilityLabel={t(
                    'notificationSettings.oralCareReminders',
                    { defaultValue: 'Brushing reminders' }
                  )}
                  value={oralCareRemindersEnabled}
                  onValueChange={handleOralCareRemindersToggle}
                />
              }
            />
            {oralCareRemindersEnabled && oralCareReminderRows.rows}
          </SettingsRowGroup>
        )}

        {notificationsEnabled && (
          <SettingsRowGroup
            title={t('notificationSettings.mealReminders', {
              defaultValue: 'Meal reminders',
            })}
          >
            <SettingsRow
              title={t('notificationSettings.mealReminderToggle', {
                defaultValue: 'Meal logging reminders',
              })}
              subtitle={t('notificationSettings.mealReminderToggleSubtitle', {
                defaultValue:
                  'A nudge to log each meal. Skipped when that meal is already logged.',
              })}
              subtitleNumberOfLines={0}
              rightAccessory={
                <Switch
                  accessibilityLabel={t(
                    'notificationSettings.mealReminderToggle',
                    { defaultValue: 'Meal logging reminders' }
                  )}
                  value={mealRemindersEnabled}
                  onValueChange={handleMealRemindersToggle}
                />
              }
            />
            {mealRemindersEnabled &&
              mealReminders.map((reminder) => {
                const mealName =
                  mealTypes.find((m) => m.id === reminder.mealTypeId)?.name ??
                  t('notificationSettings.mealReminderUnknownMeal', {
                    defaultValue: 'Meal',
                  });
                const options = [
                  ...(mealTypes.some((m) => m.id === reminder.mealTypeId)
                    ? []
                    : [{ label: mealName, value: reminder.mealTypeId }]),
                  ...mealTypes
                    .filter(
                      (m) =>
                        m.id === reminder.mealTypeId ||
                        !mealReminders.some((r) => r.mealTypeId === m.id)
                    )
                    .map((m) => ({ label: m.name, value: m.id })),
                ];
                return (
                  <ReminderRuleRow
                    key={reminder.mealTypeId}
                    value={reminder.mealTypeId}
                    options={options}
                    onChangeValue={(mealTypeId) =>
                      handleChangeMealReminderMeal(
                        reminder.mealTypeId,
                        mealTypeId
                      )
                    }
                    pickerTitle={t('notificationSettings.mealReminderPicker', {
                      defaultValue: 'Remind me to log',
                    })}
                    timeLabel={
                      formatTimeLabel(
                        reminder.time,
                        preferences?.time_format
                      ) ?? reminder.time
                    }
                    onPressTime={() => openMealTimeSheet(reminder.mealTypeId)}
                    onRemove={() =>
                      handleRemoveMealReminder(reminder.mealTypeId)
                    }
                    removeLabel={t('notificationSettings.mealReminderRemove', {
                      defaultValue: 'Remove {{meal}} reminder',
                      meal: mealName,
                    })}
                  />
                );
              })}
            {mealRemindersEnabled &&
              nextUnremindedMeal &&
              mealReminders.length < MAX_MEAL_REMINDERS && (
                <SettingsRow
                  icon="add"
                  title={t('notificationSettings.mealReminderAdd', {
                    defaultValue: 'Add meal reminder',
                  })}
                  onPress={handleAddMealReminder}
                  rightAccessory={null}
                />
              )}
          </SettingsRowGroup>
        )}

        {notificationsEnabled && (
          <SettingsRowGroup
            title={t('notificationSettings.macroAlerts', {
              defaultValue: 'Macro alerts',
            })}
          >
            <SettingsRow
              title={t('notificationSettings.macroAlertToggle', {
                defaultValue: 'Macro alerts',
              })}
              subtitle={t('notificationSettings.macroAlertToggleSubtitle', {
                defaultValue:
                  'A heads-up when you are behind on a target at the time you choose. It only fires if you are still behind, based on what you have logged when you last opened the app.',
              })}
              subtitleNumberOfLines={0}
              rightAccessory={
                <Switch
                  accessibilityLabel={t(
                    'notificationSettings.macroAlertToggle',
                    { defaultValue: 'Macro alerts' }
                  )}
                  value={macroAlertsEnabled}
                  onValueChange={handleMacroAlertsToggle}
                />
              }
            />
            {macroAlertsEnabled &&
              macroAlertRules.map((rule) => {
                const macroName = macroLabels[rule.macro];
                const options = MACRO_ALERT_KEYS.filter(
                  (macro) =>
                    macro === rule.macro ||
                    !macroAlertRules.some((r) => r.macro === macro)
                ).map((macro) => ({ label: macroLabels[macro], value: macro }));
                return (
                  <ReminderRuleRow
                    key={rule.macro}
                    value={rule.macro}
                    options={options}
                    onChangeValue={(macro) =>
                      handleChangeMacroAlertMacro(rule.macro, macro)
                    }
                    pickerTitle={t('notificationSettings.macroAlertPicker', {
                      defaultValue: 'Alert me about',
                    })}
                    timeLabel={
                      formatTimeLabel(rule.time, preferences?.time_format) ??
                      rule.time
                    }
                    onPressTime={() => openMacroTimeSheet(rule.macro)}
                    onRemove={() => handleRemoveMacroAlert(rule.macro)}
                    removeLabel={t('notificationSettings.macroAlertRemove', {
                      defaultValue: 'Remove {{macro}} alert',
                      macro: macroName,
                    })}
                  >
                    <Text className="text-xs text-text-secondary mb-2">
                      {t('notificationSettings.macroAlertShareLabel', {
                        defaultValue: 'Alert if under this share of the target',
                      })}
                    </Text>
                    <SegmentedControl
                      segments={macroPercentSegments}
                      activeKey={String(rule.percent)}
                      onSelect={(key) =>
                        handleMacroPercentSelect(
                          rule.macro,
                          Number(key) as MacroAlertPercent
                        )
                      }
                    />
                  </ReminderRuleRow>
                );
              })}
            {macroAlertsEnabled && nextUnruledMacro && (
              <SettingsRow
                icon="add"
                title={t('notificationSettings.macroAlertAdd', {
                  defaultValue: 'Add macro alert',
                })}
                onPress={handleAddMacroAlert}
                rightAccessory={null}
              />
            )}
          </SettingsRowGroup>
        )}
      </ScrollView>

      <TimeSheet
        ref={macroTimeSheetRef}
        value={
          macroAlertRules.find((r) => r.macro === editingMacro?.macro)?.time ??
          ''
        }
        onSelectTime={handleMacroTimeSelect}
        commitOn="done"
      />
      <TimeSheet
        ref={mealTimeSheetRef}
        value={
          mealReminders.find(
            (r) => r.mealTypeId === editingMealTypeId?.mealTypeId
          )?.time ?? ''
        }
        onSelectTime={handleMealTimeSelect}
        commitOn="done"
      />
      {checkinReminderRows.sheet}
      {oralCareReminderRows.sheet}
      <TimeSheet
        ref={startTimeSheetRef}
        value={waterReminderWindowStart}
        onSelectTime={handleStartTimeSelect}
        commitOn="done"
      />
      <TimeSheet
        ref={endTimeSheetRef}
        value={waterReminderWindowEnd}
        onSelectTime={handleEndTimeSelect}
        commitOn="done"
      />
    </View>
  );
};

export default NotificationSettingsScreen;
