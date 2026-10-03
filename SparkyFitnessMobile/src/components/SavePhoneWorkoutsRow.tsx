import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import Switch from './ui/Switch';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { requestPhoneWorkoutHealthAccess } from '../services/phoneWorkoutHealth';

/** iOS opt-in: file workouts finished on the phone alone in Apple Health. */
export default function SavePhoneWorkoutsRow() {
  const { t } = useTranslation();
  const enabled = useAppPreferencesStore((s) => s.saveWorkoutsToHealth);
  const setEnabled = useAppPreferencesStore((s) => s.setSaveWorkoutsToHealth);

  const onChange = (value: boolean) => {
    setEnabled(value);
    if (value) void requestPhoneWorkoutHealthAccess();
  };

  return (
    <View className="bg-surface rounded-xl p-4 mt-4 flex-row items-center">
      <View className="flex-1 pr-3">
        <Text className="text-base font-semibold text-text-primary">
          {t('healthSync.savePhoneWorkouts.title', {
            defaultValue: 'Save phone workouts to Apple Health',
          })}
        </Text>
        <Text className="text-sm text-text-secondary mt-1">
          {t('healthSync.savePhoneWorkouts.subtitle', {
            defaultValue:
              'Workouts you finish on the phone without the Apple Watch are added to Apple Health as strength training. Watch workouts are already saved by the watch.',
          })}
        </Text>
      </View>
      <Switch
        testID="save-phone-workouts-switch"
        value={enabled}
        onValueChange={onChange}
      />
    </View>
  );
}
