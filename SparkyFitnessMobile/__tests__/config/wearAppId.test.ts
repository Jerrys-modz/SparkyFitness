import fs from 'fs';
import path from 'path';

/**
 * The Wear OS app must share the phone's applicationId or the Wearable Data
 * Layer delivers nothing. `targets/wear/app/build.gradle` can't import the
 * Expo config, so it repeats the ids; this keeps the copies from drifting.
 */

const gradle = fs.readFileSync(
  path.join(__dirname, '../../targets/wear/app/build.gradle'),
  'utf8'
);
const appConfig = fs.readFileSync(
  path.join(__dirname, '../../app.config.ts'),
  'utf8'
);

describe('Wear app id', () => {
  it('defaults to the phone dev bundle identifier', () => {
    const fallback = gradle.match(
      /System\.getenv\('EXPO_DEV_BUNDLE_IDENTIFIER'\)\s*\?:\s*'([^']+)'/
    )?.[1];
    const expoDefault = fs
      .readFileSync(path.join(__dirname, '../../app.identifiers.js'), 'utf8')
      .match(/EXPO_DEV_BUNDLE_IDENTIFIER \|\|\s*'([^']+)'/)?.[1];
    expect(fallback).toBeDefined();
    expect(fallback).toBe(expoDefault);
  });

  it('uses the phone production package outside the dev variant', () => {
    const prod = appConfig.match(
      /ANDROID_PROD_BUNDLE_IDENTIFIER\s*=\s*'([^']+)'/
    )?.[1];
    expect(prod).toBeDefined();
    expect(gradle).toContain(`: '${prod}'`);
  });
});
