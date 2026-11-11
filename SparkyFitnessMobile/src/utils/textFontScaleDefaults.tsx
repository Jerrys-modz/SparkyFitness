import React from 'react';
import { PixelRatio, type TextProps } from 'react-native';

/**
 * Past this system font scale, text is allowed to shrink and wrap.
 * iOS "Large" is 1.0 and the Settings slider tops out at about 1.35.
 */
export const LARGE_FONT_SCALE = 1.15;

const SHRINK_STYLE = { flexShrink: 1 } as const;

/**
 * A single line that was fine at normal sizes ends in "…" at large ones, which
 * hides the label from the people who asked for bigger text. Let it wrap onto a
 * few lines instead.
 */
export const LARGE_FONT_MAX_LINES = 3;

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
 * and an explicit `flexShrink` in a caller's style still wins. A single-line
 * label (`numberOfLines={1}`) may wrap to a few lines instead of truncating.
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

  const WrappedText = (props: TextProps) => {
    if (getFontScale() <= LARGE_FONT_SCALE) {
      return <OriginalText {...props} />;
    }
    // Text with its own size cap (tab labels, ring centres) or that fits itself
    // to its box is already sized for a constrained space: leave its lines alone.
    const keepsOwnLines =
      props.maxFontSizeMultiplier != null || props.adjustsFontSizeToFit;
    return (
      <OriginalText
        {...props}
        numberOfLines={
          props.numberOfLines === 1 && !keepsOwnLines
            ? LARGE_FONT_MAX_LINES
            : props.numberOfLines
        }
        style={[SHRINK_STYLE, props.style]}
      />
    );
  };

  Object.assign(WrappedText, OriginalText, {
    displayName: 'Text',
    __fontScaleWrapped: true,
  });
  textModule.default = WrappedText;
};
