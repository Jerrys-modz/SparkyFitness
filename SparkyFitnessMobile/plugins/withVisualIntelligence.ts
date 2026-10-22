// Adds the iOS Visual Intelligence App Intents (plugins/ios/VisualIntelligence.swift)
// to the app target. Intents are only discovered from the app target, so they
// cannot live in the local Expo module that hands the photo to JavaScript
// (modules/visual-intelligence).
import {
  ConfigPlugin,
  IOSConfig,
  withDangerousMod,
  withXcodeProject,
} from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';

const SOURCE_FILE = 'VisualIntelligence.swift';

const withVisualIntelligence: ConfigPlugin = (config) => {
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const sourceRoot = IOSConfig.Paths.getSourceRoot(
        config.modRequest.projectRoot
      );
      await fs.promises.copyFile(
        path.join(config.modRequest.projectRoot, 'plugins', 'ios', SOURCE_FILE),
        path.join(sourceRoot, SOURCE_FILE)
      );
      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(
      config.modRequest.projectRoot
    );
    const filepath = `${projectName}/${SOURCE_FILE}`;
    if (!config.modResults.hasFile(filepath)) {
      // Defaults to the application target, not the watch or widget targets.
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: config.modResults,
      });
    }
    return config;
  });

  return config;
};

export default withVisualIntelligence;
