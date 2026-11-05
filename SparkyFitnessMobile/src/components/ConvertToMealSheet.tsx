import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Platform, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import Button from './ui/Button';
import Switch from './ui/Switch';
import FormInput from './FormInput';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import { formatDateLabel } from '../utils/dateUtils';
import type { CreateMealFromDiaryPayload } from '../services/api/mealsApi';

export interface ConvertToMealSheetRef {
  present: (date: string, mealTypeName: string, mealLabel: string) => void;
  dismiss: () => void;
}

interface ConvertToMealSheetProps {
  isPending?: boolean;
  onConvert: (payload: CreateMealFromDiaryPayload) => void;
}

const ConvertToMealSheet = forwardRef<
  ConvertToMealSheetRef,
  ConvertToMealSheetProps
>(({ isPending = false, onConvert }, ref) => {
  const { t, i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl')
    ? 'pl-PL'
    : 'en-US';
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [surfaceBg, textMuted] = useCSSVariable([
    '--color-surface',
    '--color-text-muted',
  ]) as [string, string];

  const [source, setSource] = useState<{
    date: string;
    mealTypeName: string;
    mealLabel: string;
  } | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  useImperativeHandle(ref, () => ({
    present: (date, mealTypeName, mealLabel) => {
      setSource({ date, mealTypeName, mealLabel });
      setName(`${mealLabel} - ${date}`);
      setDescription('');
      setIsPublic(false);
      bottomSheetRef.current?.present();
    },
    dismiss: () => bottomSheetRef.current?.dismiss(),
  }));

  const renderBackdrop = useSheetBackdrop();

  const handleCreate = useCallback(() => {
    const trimmed = name.trim();
    if (!source || !trimmed) return;
    onConvert({
      date: source.date,
      mealType: source.mealTypeName,
      mealName: trimmed,
      description: description.trim() || null,
      isPublic,
    });
  }, [source, name, description, isPublic, onConvert]);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      enableDynamicSizing
      enableContentPanningGesture={Platform.OS !== 'android'}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      containerComponent={sheetContainer}
      backgroundStyle={{ backgroundColor: surfaceBg }}
      handleIndicatorStyle={{ backgroundColor: textMuted }}
    >
      <BottomSheetScrollView
        contentContainerClassName="pb-safe-or-8"
        keyboardShouldPersistTaps="handled"
      >
        {source && (
          <View className="px-5">
            <View className="items-center mb-4">
              <Text className="text-text-primary text-lg font-semibold text-center">
                {t('convertToMeal.title', {
                  defaultValue: 'Save {{meal}} as a meal',
                  meal: source.mealLabel,
                })}
              </Text>
              <Text className="text-text-secondary text-sm mt-1 text-center">
                {t('convertToMeal.subtitle', {
                  defaultValue:
                    'Create a reusable meal from the foods logged on {{date}}.',
                  date: formatDateLabel(source.date, t, dateLocale),
                })}
              </Text>
            </View>

            <Text className="text-xs font-semibold uppercase text-text-muted mb-1">
              {t('convertToMeal.name', { defaultValue: 'Meal name' })}
            </Text>
            <FormInput
              value={name}
              onChangeText={setName}
              editable={!isPending}
              accessibilityLabel={t('convertToMeal.name', {
                defaultValue: 'Meal name',
              })}
              returnKeyType="done"
            />

            <Text className="text-xs font-semibold uppercase text-text-muted mt-4 mb-1">
              {t('convertToMeal.description', {
                defaultValue: 'Description (optional)',
              })}
            </Text>
            <FormInput
              value={description}
              onChangeText={setDescription}
              editable={!isPending}
              accessibilityLabel={t('convertToMeal.description', {
                defaultValue: 'Description (optional)',
              })}
              returnKeyType="done"
            />

            <View className="flex-row items-center justify-between mt-4 mb-6">
              <Text className="text-text-primary text-base">
                {t('convertToMeal.makePublic', {
                  defaultValue: 'Make public',
                })}
              </Text>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                disabled={isPending}
                accessibilityLabel={t('convertToMeal.makePublic', {
                  defaultValue: 'Make public',
                })}
              />
            </View>

            <Button
              variant="primary"
              onPress={handleCreate}
              accessibilityLabel={t('convertToMeal.create', {
                defaultValue: 'Create meal',
              })}
              disabled={isPending || !name.trim()}
            >
              {isPending
                ? t('convertToMeal.creating', { defaultValue: 'Creating...' })
                : t('convertToMeal.create', { defaultValue: 'Create meal' })}
            </Button>
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

ConvertToMealSheet.displayName = 'ConvertToMealSheet';

export default ConvertToMealSheet;
