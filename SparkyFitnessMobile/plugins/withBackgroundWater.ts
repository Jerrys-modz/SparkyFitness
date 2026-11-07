// "Log water without opening the app".
//
// iOS: adds the Siri and Shortcuts App Intents (targets/widget/ShortcutIntents.swift,
// plus plugins/ios/ShortcutProvider.swift) to the app target; intents are only discovered from the app target, so it cannot live in
// the Expo module (modules/background-water) that stores the login for it.
//
// Android: copies the Kotlin sources (targets/android-background-water), adds
// the no-UI LogWaterActivity to the manifest, adds WorkManager so the POST
// outlives that activity, and registers the native module JavaScript uses to
// store or erase the login and publish the launcher shortcut. Also copies the
// launcher shortcut icons, which the other app shortcuts
// (src/hooks/useQuickActions.ts) use too.
import {
  ConfigPlugin,
  IOSConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
  withXcodeProject,
} from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';

// Both are compiled into the app target. The intents live in the widget target's
// folder because the Lock Screen controls there run the same code; the provider
// is app-only.
const IOS_SOURCES = [
  {
    from: ['targets', 'widget', 'ShortcutIntents.swift'],
    name: 'ShortcutIntents.swift',
  },
  {
    from: ['plugins', 'ios', 'ShortcutProvider.swift'],
    name: 'ShortcutProvider.swift',
  },
] as const;

// Siri AI Developer Preview (iOS 27.3 beta SDK). Off unless the build sets
// SIRI_AI_PREVIEW=1, because the `@AppIntent(.tool)` macro does not exist in
// the SDKs production builds use (EAS images up to Xcode 27.1), so the
// attribute is added to the app target's copy of ShortcutIntents.swift only
// while this is on. The same switch copies the skills bundle into the app
// target. Apple only enables the preview for development-signed builds and
// internal TestFlight. API names may change during the preview.
const SIRI_AI_PREVIEW = process.env.SIRI_AI_PREVIEW === '1';
const SIRI_SKILLS_BUNDLE = 'Skills.skillsbundle';
const SIRI_SKILLS_SOURCE = 'plugins/ios/Skills.skillsbundle';
// The intents that do something Siri can use as a tool. The widget-only
// RemoveWaterIntent and the three control intents that only open the app stay out.
const SIRI_TOOL_INTENTS = [
  'LogWaterIntent',
  'LogWeightIntent',
  'StartFastIntent',
  'EndFastIntent',
  'CaloriesLeftIntent',
  'MacrosTodayIntent',
  'OpenWorkoutPresetIntent',
  'LogMealIntent',
];

function addSiriToolMacro(contents: string): string {
  let patched = contents;
  for (const name of SIRI_TOOL_INTENTS) {
    const declaration = `struct ${name}: AppIntent {`;
    if (!patched.includes(declaration)) {
      throw new Error(
        `withBackgroundWater: ${name} not found in ShortcutIntents.swift; update SIRI_TOOL_INTENTS.`
      );
    }
    patched = patched.replace(declaration, `@AppIntent(.tool)\n${declaration}`);
  }
  return patched;
}

// Left behind by builds from before these intents moved. A non-clean prebuild
// keeps the file and its app-target membership, which redeclares the same
// symbols as ShortcutIntents.swift.
const LEGACY_IOS_SOURCE = 'ShortcutActions.swift';
const MODULE_PACKAGE = 'com.sparkyapps.sparkyfitness.backgroundwater';
const MODULE_PACKAGE_IMPORT = `import ${MODULE_PACKAGE}.BackgroundWaterPackage`;
const MODULE_PACKAGE_ADD_LINE = 'add(BackgroundWaterPackage())';
const ACTIVITY_NAME = `${MODULE_PACKAGE}.LogWaterActivity`;
const ANDROID_SOURCE_DIR = 'targets/android-background-water/kotlin';
const ANDROID_RES_DIR = 'targets/android-background-water/res';

async function copyTree(srcDir: string, destDir: string): Promise<void> {
  const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });
  await fs.promises.mkdir(destDir, { recursive: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      await copyTree(srcPath, path.join(destDir, entry.name));
    } else {
      await fs.promises.copyFile(srcPath, path.join(destDir, entry.name));
    }
  }
}

const withBackgroundWater: ConfigPlugin = (config) => {
  // ----- iOS -----
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const sourceRoot = IOSConfig.Paths.getSourceRoot(
        config.modRequest.projectRoot
      );
      await fs.promises.rm(path.join(sourceRoot, LEGACY_IOS_SOURCE), {
        force: true,
      });
      for (const source of IOS_SOURCES) {
        const from = path.join(config.modRequest.projectRoot, ...source.from);
        const to = path.join(sourceRoot, source.name);
        if (SIRI_AI_PREVIEW && source.name === 'ShortcutIntents.swift') {
          // Only the app target's copy gets the tool macro. The widget
          // extension compiles the untouched file.
          const contents = await fs.promises.readFile(from, 'utf8');
          await fs.promises.writeFile(to, addSiriToolMacro(contents));
        } else {
          await fs.promises.copyFile(from, to);
        }
      }
      const skillsDest = path.join(sourceRoot, SIRI_SKILLS_BUNDLE);
      await fs.promises.rm(skillsDest, { recursive: true, force: true });
      if (SIRI_AI_PREVIEW) {
        await copyTree(
          path.join(config.modRequest.projectRoot, SIRI_SKILLS_SOURCE),
          skillsDest
        );
      }
      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(
      config.modRequest.projectRoot
    );
    removeLegacyIosSource(config.modResults, projectName);
    if (SIRI_AI_PREVIEW) {
      const skillsPath = `${projectName}/${SIRI_SKILLS_BUNDLE}`;
      if (!config.modResults.hasFile(skillsPath)) {
        IOSConfig.XcodeUtils.addResourceFileToGroup({
          filepath: skillsPath,
          groupName: projectName,
          isBuildFile: true,
          project: config.modResults,
        });
      }
    }
    for (const source of IOS_SOURCES) {
      const filepath = `${projectName}/${source.name}`;
      if (!config.modResults.hasFile(filepath)) {
        // Defaults to the application target, not the watch or widget targets.
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
          filepath,
          groupName: projectName,
          project: config.modResults,
        });
      }
    }
    return config;
  });

  // ----- Android -----
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      await copyTree(
        path.join(config.modRequest.projectRoot, ANDROID_SOURCE_DIR),
        path.join(config.modRequest.platformProjectRoot, 'app/src/main/java')
      );
      await copyTree(
        path.join(config.modRequest.projectRoot, ANDROID_RES_DIR),
        path.join(config.modRequest.platformProjectRoot, 'app/src/main/res')
      );
      return config;
    },
  ]);

  config = withMainApplication(config, (config) => {
    let src = config.modResults.contents;

    if (!src.includes(MODULE_PACKAGE_IMPORT)) {
      const importBlockMatch = src.match(/((?:^import [^\n]+\n)+)/m);
      if (importBlockMatch) {
        const block = importBlockMatch[1];
        src = src.replace(block, `${block}${MODULE_PACKAGE_IMPORT}\n`);
      } else {
        src = `${MODULE_PACKAGE_IMPORT}\n${src}`;
      }
    }

    if (!src.includes(MODULE_PACKAGE_ADD_LINE)) {
      const applyMatch = src.match(
        /PackageList\(this\)\.packages\.apply\s*\{\s*\n/
      );
      if (applyMatch && applyMatch.index !== undefined) {
        const insertAt = applyMatch.index + applyMatch[0].length;
        src =
          src.slice(0, insertAt) +
          `              ${MODULE_PACKAGE_ADD_LINE}\n` +
          src.slice(insertAt);
      } else {
        throw new Error(
          '[withBackgroundWater] Could not locate PackageList(this).packages.apply { block in MainApplication.'
        );
      }
    }

    config.modResults.contents = src;
    return config;
  });

  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;
    const activities = (application.activity ?? []).filter(
      (a) => a.$['android:name'] !== ACTIVITY_NAME
    );
    activities.push({
      $: {
        'android:name': ACTIVITY_NAME,
        'android:exported': 'false',
        'android:theme': '@android:style/Theme.NoDisplay',
        'android:excludeFromRecents': 'true',
        'android:noHistory': 'true',
        // A task of its own: sharing the app's would bring the app to the
        // front whenever it is open in the background.
        'android:taskAffinity': '',
      },
    });
    application.activity = activities;
    return config;
  });

  // Same artifact expo-background-task already uses, so the shortcut worker
  // compiles against one WorkManager. The library's own dependency is not
  // visible to sources copied into the app.
  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes('androidx.work:work-runtime')) {
      return config;
    }
    const dependency =
      config.modResults.language === 'kt'
        ? 'implementation("androidx.work:work-runtime-ktx:2.9.1")'
        : 'implementation "androidx.work:work-runtime-ktx:2.9.1"';
    const next = config.modResults.contents.replace(
      /dependencies\s*\{/,
      `dependencies {\n    ${dependency}`
    );
    if (next === config.modResults.contents) {
      throw new Error(
        '[withBackgroundWater] Could not locate dependencies { in app/build.gradle.'
      );
    }
    config.modResults.contents = next;
    return config;
  });

  return config;
};

// Drops ShortcutActions.swift from the app target. Missing file is a no-op, so
// a clean prebuild and a repeat run both leave the project alone.
function removeLegacyIosSource(
  project: {
    hasFile(filePath: string): unknown;
    getFirstProject(): { firstProject: { mainGroup: string } };
    getPBXGroupByKey(
      key: string
    ): { children?: { comment?: string; value: string }[] } | null | undefined;
    getTarget(productType: string): { uuid: string } | null;
    removeSourceFile(
      filePath: string,
      opt: { target?: string } | undefined,
      group: string | undefined
    ): unknown;
  },
  projectName: string
): void {
  const filepath = `${projectName}/${LEGACY_IOS_SOURCE}`;
  if (!project.hasFile(filepath)) return;
  const mainGroup = project.getPBXGroupByKey(
    project.getFirstProject().firstProject.mainGroup
  );
  const appGroup = mainGroup?.children?.find(
    (child) => child.comment === projectName
  );
  const applicationTarget = project.getTarget(
    'com.apple.product-type.application'
  );
  project.removeSourceFile(
    filepath,
    applicationTarget ? { target: applicationTarget.uuid } : undefined,
    appGroup?.value
  );
}

export default withBackgroundWater;
