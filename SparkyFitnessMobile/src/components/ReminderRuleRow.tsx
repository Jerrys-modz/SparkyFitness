import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';

import BottomSheetPicker, { type PickerOption } from './BottomSheetPicker';
import Icon from './Icon';

interface ReminderRuleRowProps<T extends string> {
  /** The thing being reminded about (a meal or a macro), chosen from `options`. */
  value: T;
  options: PickerOption<T>[];
  onChangeValue: (value: T) => void;
  pickerTitle: string;
  /** Localized time, as shown (for example "6:00 PM"). */
  timeLabel: string;
  onPressTime: () => void;
  onRemove: () => void;
  removeLabel: string;
  /** Extra controls under the row, such as a percent selector. */
  children?: React.ReactNode;
}

/**
 * One editable reminder rule: a dropdown for what it is about, a tappable
 * time, and a remove button, with optional extra controls beneath. Shared by
 * the meal reminders and the macro alerts so both edit the same way.
 */
function ReminderRuleRow<T extends string>({
  value,
  options,
  onChangeValue,
  pickerTitle,
  timeLabel,
  onPressTime,
  onRemove,
  removeLabel,
  children,
}: ReminderRuleRowProps<T>) {
  const { t } = useTranslation();
  const [secondaryColor] = useCSSVariable(['--color-text-secondary']) as [
    string,
  ];

  return (
    <View className="px-4 py-3">
      <View className="flex-row items-center">
        <View className="flex-1">
          <BottomSheetPicker
            value={value}
            options={options}
            onSelect={onChangeValue}
            title={pickerTitle}
          />
        </View>
        <TouchableOpacity
          onPress={onPressTime}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('notificationSettings.ruleTimeAccessibility', {
            defaultValue: 'Time, {{time}}',
            time: timeLabel,
          })}
          accessibilityHint={t('notificationSettings.ruleTimeHint', {
            defaultValue: 'Opens the time picker',
          })}
          className="ml-2 px-3 py-2.5 rounded-lg border border-border-subtle bg-raised min-h-11 justify-center"
        >
          <Text className="text-base text-text-primary">{timeLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={removeLabel}
          hitSlop={10}
          className="ml-2 p-2"
        >
          <Icon name="close" size={18} color={secondaryColor} />
        </TouchableOpacity>
      </View>
      {children ? <View className="mt-3">{children}</View> : null}
    </View>
  );
}

export default ReminderRuleRow;
