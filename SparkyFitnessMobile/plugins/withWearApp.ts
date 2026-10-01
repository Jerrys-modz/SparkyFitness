import { ConfigPlugin, withSettingsGradle } from 'expo/config-plugins';

/**
 * Hooks the Wear OS app into the generated Android project. `expo prebuild`
 * already recreates `android/` (gitignored); this adds the wear module to
 * that project so `./gradlew :wear:assembleDebug` builds it with the phone
 * app. The sources stay in `targets/wear`.
 */
const withWearApp: ConfigPlugin = (config) =>
  withSettingsGradle(config, (config) => {
    if (config.modResults.contents.includes("':wear'")) return config;
    config.modResults.contents += `
include ':wear'
project(':wear').projectDir = new File(rootProject.projectDir, '../targets/wear/app')
`;
    return config;
  });

export default withWearApp;
