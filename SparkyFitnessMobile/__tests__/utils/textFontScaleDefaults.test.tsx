import React from 'react';
import { render } from '@testing-library/react-native';
import { View, type TextProps } from 'react-native';
import {
  installTextFontScaleDefaults,
  LARGE_FONT_MAX_LINES,
  LARGE_FONT_SCALE,
} from '../../src/utils/textFontScaleDefaults';

const Original = (props: TextProps) => (
  <View testID="text" {...(props as object)} />
);

const setup = (fontScale: number) => {
  const textModule = { default: Original as React.ComponentType<TextProps> };
  installTextFontScaleDefaults(textModule, () => fontScale);
  return textModule.default;
};

const styleOf = (el: { props: { style?: unknown } }) =>
  ([] as unknown[]).concat(el.props.style ?? []).flat();

describe('installTextFontScaleDefaults', () => {
  it('lets text shrink at large font scales', () => {
    const Text = setup(1.35);
    const { getByTestId } = render(<Text style={{ color: 'red' }} />);
    const style = styleOf(getByTestId('text'));
    expect(style).toContainEqual({ flexShrink: 1 });
    expect(style).toContainEqual({ color: 'red' });
  });

  it('lets a caller override flexShrink', () => {
    const Text = setup(1.35);
    const { getByTestId } = render(<Text style={{ flexShrink: 0 }} />);
    expect(styleOf(getByTestId('text')).at(-1)).toEqual({ flexShrink: 0 });
  });

  it('leaves styles untouched at normal font scales', () => {
    const Text = setup(LARGE_FONT_SCALE);
    const { getByTestId } = render(<Text style={{ color: 'red' }} />);
    expect(styleOf(getByTestId('text'))).toEqual([{ color: 'red' }]);
  });

  it('lets single-line text wrap at large font scales', () => {
    const Text = setup(1.35);
    const { getByTestId } = render(<Text numberOfLines={1} />);
    expect(getByTestId('text').props.numberOfLines).toBe(LARGE_FONT_MAX_LINES);
  });

  it('keeps single-line text at normal font scales', () => {
    const Text = setup(1);
    const { getByTestId } = render(<Text numberOfLines={1} />);
    expect(getByTestId('text').props.numberOfLines).toBe(1);
  });

  it('keeps the lines of text that sizes itself to a constrained box', () => {
    const Text = setup(1.35);
    const capped = render(
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} />
    );
    expect(capped.getByTestId('text').props.numberOfLines).toBe(1);
    const fitted = render(<Text numberOfLines={1} adjustsFontSizeToFit />);
    expect(fitted.getByTestId('text').props.numberOfLines).toBe(1);
  });

  it('leaves multi-line limits alone', () => {
    const Text = setup(1.35);
    const { getByTestId } = render(<Text numberOfLines={2} />);
    expect(getByTestId('text').props.numberOfLines).toBe(2);
  });

  it('does not wrap twice', () => {
    const textModule = { default: Original as React.ComponentType<TextProps> };
    installTextFontScaleDefaults(textModule, () => 1);
    const first = textModule.default;
    installTextFontScaleDefaults(textModule, () => 1);
    expect(textModule.default).toBe(first);
  });
});
