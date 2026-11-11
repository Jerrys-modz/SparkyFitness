import React from 'react';
import { PixelRatio, type TextProps } from 'react-native';

/**
 * Past this system font scale, text is allowed to shrink and wrap.
 * iOS "Large" is 1.0 and the Settings slider tops out at about 1.35.
 */
export const LARGE_FONT_SCALE = 1.15;

const SHRINK_STYLE = { flexShrink: 1 } as const;

type TextComponent = React.ComponentType<TextProps>;

interface TextModule {
  default: TextComponent;
}

/**
 * Yoga's default `flexShrink` is 0, so a `Text` in a row keeps its full
 * single-line width. Fixed layouts that fit at normal sizes then overflow,
 * push siblings out and overlap once the system font size is raised. This wraps
 * React Native's `Text` once, at startup, so every screen in the app lets text
 * shrink and wrap at large font scales. Normal sizes render exactly as before,
 * and an explicit `flexShrink` in a caller's style still wins.
 *
 * Must run before anything captures `Text` from `react-native` (Uniwind copies
 * it when its own `Text` module loads), so import it first in `index.js`.
 */
export const installTextFontScaleDefaults = (
  textModule: TextModule,
  getFontScale: () => number = PixelRatio.getFontScale
): void => {
  const OriginalText = textModule.default;
  if ((OriginalText as { __fontScaleWrapped?: boolean }).__fontScaleWrapped) {
    return;
  }

  const WrappedText = (props: TextProps) =>
    getFontScale() > LARGE_FONT_SCALE ? (
      <OriginalText {...props} style={[SHRINK_STYLE, props.style]} />
    ) : (
      <OriginalText {...props} />
    );

  Object.assign(WrappedText, OriginalText, {
    displayName: 'Text',
    __fontScaleWrapped: true,
  });
  textModule.default = WrappedText;
};
