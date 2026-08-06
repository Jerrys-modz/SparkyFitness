const { isDevVariant, DEV_BUNDLE_IDENTIFIER } = require('../../app.identifiers.js');

/**
 * watchOS companion app (type "watch": a standalone app with a companion iOS
 * app, embedded into the main app target by @bacons/apple-targets). It talks
 * to the phone over WatchConnectivity (see `modules/sparky-watch-connectivity/`
 * and `src/services/watchContext.ts`) rather than the widget's shared App
 * Group — App Groups don't sync across a phone and its paired watch, they're
 * only shared within one device's sandbox.
 *
 * HealthKit is separate from that bridge: the watch runs its own
 * `HKWorkoutSession` (see `WorkoutSessionManager.swift`) for the duration of
 * a Sparky workout so real heart rate gets sampled and the finished workout
 * saves to Apple Health like any other Watch workout — the phone's existing
 * HealthKit inbound sync then picks it up, no WatchConnectivity involved.
 * The usage-description strings live in `Info.plist` (hand-written — see the
 * comment there for why the plugin's auto-generated one isn't used).
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = () => {
  const isDev = isDevVariant();

  return {
    type: 'watch',
    name: 'SparkyFitnessWatch',
    bundleIdentifier: isDev
      ? `${DEV_BUNDLE_IDENTIFIER}.watchkitapp`
      : 'com.SparkyApps.SparkyFitnessMobile.watchkitapp',
    icon: '../../assets/icons/adaptiveicon.png',
    deploymentTarget: '10.0',
    frameworks: ['WatchConnectivity', 'HealthKit'],
    entitlements: {
      'com.apple.developer.healthkit': true,
    },
  };
};
