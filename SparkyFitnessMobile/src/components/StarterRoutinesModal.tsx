import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useAddStarterRoutine, useStarterRoutines } from '../hooks';

interface StarterRoutinesModalProps {
  visible: boolean;
  onClose: () => void;
}

const StarterRoutinesModal: React.FC<StarterRoutinesModalProps> = ({
  visible,
  onClose,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [accentColor, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-secondary',
  ]) as [string, string];
  const { data: routines = [], isLoading } = useStarterRoutines(visible);
  const { addRoutine, isPending, pendingRoutineId } = useAddStarterRoutine();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        className="flex-1 bg-background px-4"
        style={{ paddingTop: 16, paddingBottom: insets.bottom + 16 }}
      >
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-text-primary text-lg font-semibold">
            {t('starterRoutines.title', { defaultValue: 'Stretch routines' })}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
          >
            <Text style={{ color: accentColor }} className="text-base">
              {t('common.close', { defaultValue: 'Close' })}
            </Text>
          </TouchableOpacity>
        </View>
        <Text className="text-sm mb-4" style={{ color: textSecondary }}>
          {t('starterRoutines.description', {
            defaultValue:
              'Add a ready-made stretching routine to your presets. You can edit your copy afterwards.',
          })}
        </Text>
        {isLoading ? (
          <ActivityIndicator color={accentColor} />
        ) : (
          <FlatList
            data={routines}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View className="h-3" />}
            renderItem={({ item }) => (
              <View className="flex-row items-center gap-3 rounded-lg border border-border-subtle bg-raised p-3">
                <View className="flex-1">
                  <Text className="text-text-primary text-base font-medium">
                    {item.name}
                  </Text>
                  <Text
                    className="text-sm mt-0.5"
                    style={{ color: textSecondary }}
                  >
                    {item.description}
                  </Text>
                  <Text
                    className="text-xs mt-1"
                    style={{ color: textSecondary }}
                  >
                    {t('starterRoutines.moveCount', {
                      defaultValue: '{{count}} moves',
                      defaultValue_one: '{{count}} move',
                      defaultValue_other: '{{count}} moves',
                      count: item.move_count,
                    })}
                  </Text>
                </View>
                <TouchableOpacity
                  className="px-3 py-2 rounded-lg"
                  style={{
                    backgroundColor: accentColor,
                    opacity: isPending ? 0.6 : 1,
                  }}
                  disabled={isPending}
                  onPress={() => addRoutine(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('starterRoutines.addA11y', {
                    defaultValue: 'Add {{name}} to workout presets',
                    name: item.name,
                  })}
                >
                  {isPending && pendingRoutineId === item.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-medium">
                      {t('common.add', { defaultValue: 'Add' })}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>
    </Modal>
  );
};

export default StarterRoutinesModal;
