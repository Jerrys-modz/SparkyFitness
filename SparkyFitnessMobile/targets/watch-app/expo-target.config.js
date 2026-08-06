const { isDevVariant, DEV_BUNDLE_IDENTIFIER } = require('../../app.identifiers.js');

/**
 * watchOS companion app (type "watch": a standalone app with a companion iOS
 * app, embedded into the main app target by @bacons/apple-targets). It talks
 * to the phone over WatchConnectivity (see `modules/sparky-watch-connectivity/`
 * and `src/services/watchContext.ts`) rather than the widget's shared App
 * Group — App Groups don't sync across a phone and its paired watch, they're
 * only shared within one device's sandbox.
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
    frameworks: ['WatchConnectivity'],
  };
};
