import React, { useState } from 'react';
import {
  Platform,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  type NativeSyntheticEvent,
  type TextInputFocusEventData,
  type TextInputProps,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { formatLocalizedNumber } from '../localization/i18n';
import {
  QUANTITY_INPUT_MAX_LENGTH,
  describeQuantityInput,
  formatQuantityResult,
} from '../utils/quantityExpression';

interface StepperDraftOptions {
  /** Committed value, shown whenever the field is not mid-edit. */
  value: number;
  min: number;
  max: number;
  /** Amount the +/- buttons move by. Defaults to 1. */
  step?: number;
  onCommit: (value: number) => void;
  /** Called when an optional field is left empty. Required fields omit this. */
  onClear?: () => void;
}

interface StepperDraftProps {
  value: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}

/**
 * Holds keystrokes for a bounded integer field in local state so a partial
 * entry ("2" on the way to "28") is never clamped or pushed to a caller that
 * rejects out-of-range values. In-range text commits as it is typed; anything
 * still out of range is clamped and committed on blur. Empty text restores a
 * required field or invokes the optional field's clear handler.
 */
export function useStepperDraft({
  value,
  min,
  max,
  step = 1,
  onCommit,
  onClear,
}: StepperDraftOptions): StepperDraftProps {
  const [draft, setDraft] = useState<string | null>(null);

  const handleChangeText = (text: string) => {
    if (text !== '' && !/^\d+$/.test(text)) return;
    setDraft(text);
    const parsed = parseInt(text, 10);
    if (
      !Number.isNaN(parsed) &&
      parsed >= min &&
      parsed <= max &&
      parsed !== value
    ) {
      onCommit(parsed);
    }
  };

  const handleBlur = () => {
    if (draft === null) return;
    setDraft(null);
    if (draft === '') {
      onClear?.();
      return;
    }
    const parsed = parseInt(draft, 10);
    const clamped = Math.max(min, Math.min(max, parsed));
    if (clamped !== value) onCommit(clamped);
  };

  const adjust = (delta: number) => {
    const parsed = draft === null ? NaN : parseInt(draft, 10);
    const base = Number.isNaN(parsed) ? value : parsed;
    setDraft(null);
    const next = Math.max(min, Math.min(max, base + delta));
    if (next !== value) onCommit(next);
  };

  return {
    value: draft ?? String(value),
    onChangeText: handleChangeText,
    onBlur: handleBlur,
    onIncrement: () => adjust(step),
    onDecrement: () => adjust(-step),
  };
}

interface StepperInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  keyboardType?:
    'decimal-pad' | 'number-pad' | 'numbers-and-punctuation' | 'numeric';
  placeholder?: string;
  selectTextOnFocus?: boolean;
  /** Override the TextInput component (e.g., BottomSheetTextInput) */
  InputComponent?: React.ComponentType<any>;
  /** Extra props forwarded to the text input */
  inputProps?: Partial<TextInputProps>;
  /** Ref forwarded to the underlying text input for imperative focus control */
  inputRef?: React.Ref<TextInput>;
  /** Accessibility labels for the decrement, input, and increment controls. */
  accessibilityLabels?: {
    decrement?: string;
    input?: string;
    increment?: string;
  };
  /** Compact size for inline use in set rows */
  compact?: boolean;
  /**
   * Quantity fields: accept arithmetic such as `2*3` or `1/2`. Switches to a
   * keyboard with operators, shows the evaluated result (or an inline error)
   * under the field, and on blur replaces a valid expression with its result.
   * An invalid expression keeps its text and skips `onBlur`, so a caller's
   * clamp cannot overwrite it. The caller still parses with
   * `parseQuantityInput`, which yields NaN for an invalid expression.
   */
  allowExpressions?: boolean;
}

type TextInputFocusEvent = NativeSyntheticEvent<TextInputFocusEventData>;

function StepperInput({
  value,
  onChangeText,
  onBlur,
  onIncrement,
  onDecrement,
  keyboardType = 'decimal-pad',
  placeholder = '0',
  selectTextOnFocus = true,
  InputComponent = TextInput,
  inputProps,
  inputRef,
  accessibilityLabels,
  compact = false,
  allowExpressions = false,
}: StepperInputProps) {
  const { t } = useTranslation();
  const [accentColor, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-border-subtle',
  ]) as [string, string];
  const [isFocused, setIsFocused] = useState(false);

  const size = compact ? 32 : 40;
  const inputWidth = compact ? 48 : 56;
  const iconSize = compact ? 18 : 20;
  const fontSize = compact ? 16 : 20;

  const borderColor = isFocused ? accentColor : borderSubtle;
  const expression = allowExpressions ? describeQuantityInput(value) : null;
  // `numbers-and-punctuation` is the iOS keyboard that reaches + - * / ( ), one
  // page away from the digits. Android has no such type, and its numeric
  // keyboards hide the operators, so it keeps the default keyboard.
  const effectiveKeyboardType = allowExpressions
    ? Platform.OS === 'ios'
      ? 'numbers-and-punctuation'
      : 'default'
    : keyboardType;
  const {
    onFocus: externalOnFocus,
    onBlur: externalOnBlur,
    ...restInputProps
  } = inputProps ?? {};

  const handleBlur = () => {
    if (expression?.kind === 'expression') {
      onChangeText(formatQuantityResult(expression.value));
    } else if (expression?.kind === 'invalid') {
      return;
    }
    onBlur?.();
  };

  const control = (
    <View
      className="flex-row items-center bg-raised rounded-lg overflow-hidden"
      style={{ borderWidth: 1, borderColor }}
    >
      <TouchableOpacity
        onPress={onDecrement}
        style={{
          width: size,
          height: size,
          borderRightWidth: 1,
          borderRightColor: borderColor,
        }}
        className="items-center justify-center"
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabels?.decrement}
      >
        <Icon name="remove" size={iconSize} color={accentColor} />
      </TouchableOpacity>
      <InputComponent
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={(e: TextInputFocusEvent) => {
          setIsFocused(true);
          externalOnFocus?.(e);
        }}
        onBlur={(e: TextInputFocusEvent) => {
          setIsFocused(false);
          handleBlur();
          externalOnBlur?.(e);
        }}
        keyboardType={effectiveKeyboardType}
        maxLength={allowExpressions ? QUANTITY_INPUT_MAX_LENGTH : undefined}
        placeholder={placeholder}
        selectTextOnFocus={selectTextOnFocus}
        className="text-text-primary text-base text-center"
        style={{
          width: inputWidth,
          height: size,
          fontSize,
          lineHeight: fontSize + 2,
          padding: 0,
        }}
        accessibilityLabel={accessibilityLabels?.input}
        {...restInputProps}
      />
      <TouchableOpacity
        onPress={onIncrement}
        style={{
          width: size,
          height: size,
          borderLeftWidth: 1,
          borderLeftColor: borderColor,
        }}
        className="items-center justify-center"
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabels?.increment}
      >
        <Icon name="add" size={iconSize} color={accentColor} />
      </TouchableOpacity>
    </View>
  );

  if (!expression) return control;

  const shownResult =
    expression.kind === 'expression'
      ? formatLocalizedNumber(expression.value, { maximumFractionDigits: 3 })
      : null;

  // The wrapper is always rendered so the hint appearing or going away never
  // remounts the TextInput (that would drop focus mid-typing).
  return (
    <View>
      {control}
      {shownResult !== null && (
        <Text
          className="text-xs mt-1 text-text-secondary"
          accessibilityLiveRegion="polite"
          accessibilityLabel={t('quantityExpression.resultLabel', {
            defaultValue: 'Result: {{value}}',
            value: shownResult,
          })}
        >
          {t('quantityExpression.result', {
            defaultValue: '= {{value}}',
            value: shownResult,
          })}
        </Text>
      )}
      {expression.kind === 'invalid' && (
        <Text
          className="text-xs mt-1 text-text-danger-subtle"
          accessibilityLiveRegion="polite"
        >
          {t('quantityExpression.invalid', {
            defaultValue: 'Enter a valid calculation, such as 1/2 or 2*3.',
          })}
        </Text>
      )}
    </View>
  );
}

export default React.memo(StepperInput);
