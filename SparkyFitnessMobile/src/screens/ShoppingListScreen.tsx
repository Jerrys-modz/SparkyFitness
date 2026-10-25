import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ShoppingListItem } from '@workspace/shared';

import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  useShoppingList,
  useShoppingListMutations,
} from '../hooks/useShoppingList';
import { formatLocalizedNumber } from '../localization';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ShoppingList'>;

const ItemRow: React.FC<{
  item: ShoppingListItem;
  onToggle: () => void;
  onDelete: () => void;
}> = ({ item, onToggle, onDelete }) => {
  const { t } = useTranslation();
  const amount = [
    item.quantity != null
      ? formatLocalizedNumber(item.quantity, { maximumFractionDigits: 2 })
      : null,
    item.unit || null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <View className="bg-surface rounded-xl px-3 py-3 mb-2 flex-row items-center">
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.is_checked }}
        accessibilityLabel={item.name}
        className="flex-1 flex-row items-center pr-2"
      >
        <Icon
          name={
            item.is_checked ? 'checkmark-circle-filled' : 'checkmark-circle'
          }
          size={24}
          color={item.is_checked ? '#16a34a' : '#999999'}
        />
        <View className="flex-1 ml-3">
          <Text
            className={`text-base ${
              item.is_checked
                ? 'text-text-secondary line-through'
                : 'text-text-primary'
            }`}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          {amount || item.note ? (
            <Text className="text-sm text-text-secondary" numberOfLines={1}>
              {[amount, item.note].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        onPress={onDelete}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('shoppingList.deleteItem', {
          defaultValue: 'Delete {{name}}',
          name: item.name,
        })}
      >
        <Icon name="trash" size={20} color="#999999" />
      </Pressable>
    </View>
  );
};

const ShoppingListScreen: React.FC<Props> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { items, isLoading, isError, refetch } = useShoppingList();
  const { addMutation, toggleMutation, deleteMutation, clearCheckedMutation } =
    useShoppingListMutations();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');

  const header = useScreenHeader({
    title: t('shoppingList.title', { defaultValue: 'Shopping List' }),
    left: { kind: 'back' },
  });

  const unchecked = items.filter((item) => !item.is_checked);
  const checked = items.filter((item) => item.is_checked);

  const parsedQuantity = quantity.trim()
    ? Number(quantity.trim().replace(',', '.'))
    : null;
  const quantityInvalid =
    parsedQuantity !== null &&
    (!Number.isFinite(parsedQuantity) ||
      parsedQuantity <= 0 ||
      parsedQuantity > 100000);
  const canAdd =
    name.trim().length > 0 && !quantityInvalid && !addMutation.isPending;

  const handleAdd = () => {
    if (!canAdd) return;
    const trimmedUnit = unit.trim();
    addMutation.mutate(
      {
        name: name.trim(),
        ...(parsedQuantity !== null ? { quantity: parsedQuantity } : {}),
        ...(trimmedUnit ? { unit: trimmedUnit } : {}),
      },
      {
        onSuccess: () => {
          setName('');
          setQuantity('');
          setUnit('');
        },
      }
    );
  };

  const handleClearChecked = () => {
    if (clearCheckedMutation.isPending) return;
    Alert.alert(
      t('shoppingList.clearTitle', { defaultValue: 'Clear checked items?' }),
      t('shoppingList.clearDescription', {
        defaultValue: 'This removes every checked item from your list.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('shoppingList.clearChecked', { defaultValue: 'Clear' }),
          style: 'destructive',
          onPress: () => clearCheckedMutation.mutate(),
        },
      ]
    );
  };

  const renderItems = (list: ShoppingListItem[]) =>
    list.map((item) => (
      <ItemRow
        key={item.id}
        item={item}
        onToggle={() =>
          toggleMutation.mutate({ id: item.id, isChecked: !item.is_checked })
        }
        onDelete={() => deleteMutation.mutate(item.id)}
      />
    ));

  const addRow = (
    <View className="bg-surface rounded-xl p-3 mb-4">
      <FormInput
        value={name}
        onChangeText={setName}
        maxLength={200}
        returnKeyType="done"
        onSubmitEditing={handleAdd}
        placeholder={t('shoppingList.namePlaceholder', {
          defaultValue: 'Add an item',
        })}
        accessibilityLabel={t('shoppingList.name', { defaultValue: 'Item' })}
      />
      <View className="flex-row mt-2 items-center">
        <View className="flex-1 mr-2">
          <FormInput
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            placeholder={t('shoppingList.quantityPlaceholder', {
              defaultValue: 'Qty',
            })}
            accessibilityLabel={t('shoppingList.quantity', {
              defaultValue: 'Quantity',
            })}
          />
        </View>
        <View className="flex-1 mr-2">
          <FormInput
            value={unit}
            onChangeText={setUnit}
            maxLength={50}
            placeholder={t('shoppingList.unitPlaceholder', {
              defaultValue: 'Unit',
            })}
            accessibilityLabel={t('shoppingList.unit', {
              defaultValue: 'Unit',
            })}
          />
        </View>
        <Button
          variant="primary"
          onPress={handleAdd}
          disabled={!canAdd}
          loading={addMutation.isPending}
          accessibilityLabel={t('shoppingList.add', { defaultValue: 'Add' })}
          className="px-4"
        >
          {t('shoppingList.add', { defaultValue: 'Add' })}
        </Button>
      </View>
      {quantityInvalid ? (
        <Text className="text-sm text-red-500 mt-1">
          {t('shoppingList.quantityInvalid', {
            defaultValue: 'Enter a quantity greater than 0.',
          })}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {isError ? (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={t('shoppingList.loadFailed', {
            defaultValue: 'Could not load your shopping list.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
          }}
        />
      ) : isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 24 + activeWorkoutBarPadding,
          }}
        >
          {addRow}
          {items.length === 0 ? (
            <View className="items-center py-8">
              <Text className="text-base font-semibold text-text-primary">
                {t('shoppingList.empty', {
                  defaultValue: 'Your list is empty',
                })}
              </Text>
              <Text className="text-sm text-text-secondary mt-1 text-center">
                {t('shoppingList.emptyHint', {
                  defaultValue: 'Add what you need to buy above.',
                })}
              </Text>
            </View>
          ) : null}
          {renderItems(unchecked)}
          {checked.length > 0 ? (
            <>
              <View className="flex-row items-center justify-between mt-2 mb-2">
                <Text className="text-sm font-semibold text-text-secondary">
                  {t('shoppingList.checkedSection', {
                    defaultValue: 'Checked ({{total}})',
                    total: checked.length,
                  })}
                </Text>
                <Pressable
                  onPress={handleClearChecked}
                  disabled={clearCheckedMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={t('shoppingList.clearChecked', {
                    defaultValue: 'Clear',
                  })}
                >
                  <Text className="text-sm font-semibold text-accent-primary">
                    {t('shoppingList.clearChecked', { defaultValue: 'Clear' })}
                  </Text>
                </Pressable>
              </View>
              {renderItems(checked)}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
};

export default ShoppingListScreen;
