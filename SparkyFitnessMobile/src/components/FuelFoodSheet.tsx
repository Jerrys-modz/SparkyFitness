import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';

import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import { useFoodsLibrary } from '../hooks/useFoodsLibrary';
import { formatLocalizedNumber } from '../localization';
import type { FoodItem } from '../types/foods';

export interface FuelFoodSheetRef {
  present: () => void;
  dismiss: () => void;
}

interface FuelFoodSheetProps {
  onSelect: (food: FoodItem) => void;
}

/** A searchable list of the person's saved foods, to pick what they carry. */
const FuelFoodSheet = forwardRef<FuelFoodSheetRef, FuelFoodSheetProps>(
  ({ onSelect }, ref) => {
    const { t } = useTranslation();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [surfaceBg, textMuted, textPrimary] = useCSSVariable([
      '--color-surface',
      '--color-text-muted',
      '--color-text-primary',
    ]) as [string, string, string];
    const renderBackdrop = useSheetBackdrop();

    const { foods, isLoading, isError, loadMore, isFetchingNextPage } =
      useFoodsLibrary(search, { enabled: open });

    useImperativeHandle(ref, () => ({
      present: () => {
        setOpen(true);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const handleSelect = useCallback(
      (food: FoodItem) => {
        sheetRef.current?.dismiss();
        onSelect(food);
      },
      [onSelect]
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={['75%']}
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        containerComponent={sheetContainer}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        onDismiss={() => setSearch('')}
      >
        <View className="px-4 pt-2 pb-3">
          <Text className="text-lg font-semibold text-center text-text-primary mb-3">
            {t('fuelingPlan.chooseFood', {
              defaultValue: 'Choose a saved food',
            })}
          </Text>
          <BottomSheetTextInput
            testID="fuel-food-search"
            accessibilityLabel={t('fuelingPlan.searchFoods', {
              defaultValue: 'Search your foods',
            })}
            value={search}
            onChangeText={setSearch}
            placeholder={t('fuelingPlan.searchFoods', {
              defaultValue: 'Search your foods',
            })}
            placeholderTextColor={textMuted}
            autoCorrect={false}
            className="bg-raised rounded-lg px-3"
            style={{
              height: 44,
              paddingVertical: 0,
              fontSize: 16,
              color: textPrimary,
            }}
          />
        </View>
        {isLoading ? (
          <ActivityIndicator className="mt-6" />
        ) : isError ? (
          <Text className="text-text-secondary text-center mt-6 px-4">
            {t('fuelingPlan.foodsFailed', {
              defaultValue: 'Could not load your foods.',
            })}
          </Text>
        ) : (
          <BottomSheetFlatList
            data={foods}
            keyExtractor={(food: FoodItem) => food.id}
            keyboardShouldPersistTaps="handled"
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              <Text className="text-text-secondary text-center mt-6 px-4">
                {t('fuelingPlan.noFoods', { defaultValue: 'No foods found.' })}
              </Text>
            }
            ListFooterComponent={
              isFetchingNextPage ? <ActivityIndicator className="my-3" /> : null
            }
            renderItem={({ item }: { item: FoodItem }) => (
              <TouchableOpacity
                testID={`fuel-food-${item.id}`}
                className="px-4 py-3 border-b border-border-subtle"
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text className="text-base text-text-primary">{item.name}</Text>
                <Text className="text-sm text-text-secondary mt-0.5">
                  {[
                    item.brand,
                    t('fuelingPlan.foodCarbs', {
                      defaultValue: '{{carbs}} g carbs per {{size}} {{unit}}',
                      carbs: formatLocalizedNumber(item.default_variant.carbs, {
                        maximumFractionDigits: 1,
                      }),
                      size: formatLocalizedNumber(
                        item.default_variant.serving_size,
                        { maximumFractionDigits: 1 }
                      ),
                      unit: item.default_variant.serving_unit,
                    }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </BottomSheetModal>
    );
  }
);

FuelFoodSheet.displayName = 'FuelFoodSheet';

export default FuelFoodSheet;
