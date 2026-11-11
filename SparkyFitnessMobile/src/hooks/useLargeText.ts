import { useWindowDimensions } from 'react-native';

/**
 * System font scale above which side-by-side layouts should stack. iOS's
 * Settings slider tops out near 1.35, so this covers its largest everyday size
 * as well as the Accessibility sizes and Android's font scale up to 2.0.
 */
export const STACK_FONT_SCALE = 1.3;

/**
 * True when the user's system text size is large enough that two-column rows
 * and label/value pairs no longer fit. Use it to stack a layout instead of
 * shrinking or capping the text, so people who want big text still get it.
 */
export const useLargeText = (): boolean => {
  const { fontScale } = useWindowDimensions();
  return fontScale > STACK_FONT_SCALE;
};
