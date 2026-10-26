import { Platform } from 'react-native';

import { screenTopInset } from '../../src/utils/screenTopInset';

describe('screenTopInset', () => {
  it('leaves the inset to the native iOS header', () => {
    expect(
      screenTopInset(47, { usesNativeHeader: true, asSheet: false })
    ).toBeUndefined();
    expect(
      screenTopInset(47, { usesNativeHeader: true, asSheet: true })
    ).toBeUndefined();
  });

  it('pads a pushed screen that draws its own header', () => {
    expect(
      screenTopInset(47, { usesNativeHeader: false, asSheet: false })
    ).toEqual({ paddingTop: 47 });
  });

  it('does not pad an iOS sheet, which already starts below the status bar', () => {
    expect(
      screenTopInset(47, { usesNativeHeader: false, asSheet: true })
    ).toBeUndefined();
  });

  it('pads a sheet on Android, where every screen is full height', () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      expect(
        screenTopInset(24, { usesNativeHeader: false, asSheet: true })
      ).toEqual({ paddingTop: 24 });
    } finally {
      platform.restore();
    }
  });
});
