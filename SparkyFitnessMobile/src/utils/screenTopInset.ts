import { Platform, type ViewStyle } from 'react-native';

/**
 * Root top padding for a screen that is pushed on its own but can also be
 * shown as an iOS sheet (the guided check-in's photos step, and the screens it
 * opens). Pushed, it pads below the status bar only on the custom header path.
 * An iOS sheet already starts below the status bar, so there only Android,
 * where every screen is full height, pads.
 */
export function screenTopInset(
  top: number,
  { usesNativeHeader, asSheet }: { usesNativeHeader: boolean; asSheet: boolean }
): ViewStyle | undefined {
  if (usesNativeHeader) return undefined;
  if (asSheet && Platform.OS !== 'android') return undefined;
  return { paddingTop: top };
}
