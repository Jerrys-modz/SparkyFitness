import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Builds the watchOS companion and runs it on a simulator.
 *
 * Two optional flags turn that into a workout test rig, which is the only way
 * to exercise this feature end to end without a paid Apple Developer account:
 *
 *   --pair      Pair the watch simulator to an iPhone simulator, so
 *               WatchConnectivity has a counterpart and the phone can arm a
 *               workout, receive completed sets and receive heart-rate
 *               batches. Without it the watch app runs alone and everything it
 *               sends just sits in the transfer queue.
 *   --fake-hr   Launch with SPARKY_FAKE_HR=1, which substitutes
 *               `SyntheticWorkoutSignal` for the sensors a simulator does not
 *               have. Only the reading itself is synthetic: batching,
 *               timestamps, the energy delta, the transfer, the phone's flush
 *               and the telemetry POST are all the shipping code.
 *
 * `pnpm run watch:e2e` is both together. The Apple Watch section of AGENTS.md
 * has the run order — pair before launching the phone app.
 */
const args = process.argv.slice(2);
const shouldPair = args.includes('--pair');
const fakeHeartRate = args.includes('--fake-hr');

const phoneBundleId =
  process.env.EXPO_DEV_BUNDLE_IDENTIFIER ??
  'org.SparkyApps.SparkyFitnessMobile1.dev';
const bundleId = `${phoneBundleId}.watchkitapp`;

const simctlJson = (command) =>
  JSON.parse(execSync(`xcrun simctl ${command} -j`, { encoding: 'utf-8' }));

// Scheme and product name both come from `name` in
// targets/watch/expo-target.config.js. They are one word — an earlier
// "SparkyFitness Watch" (with a space) here matched no scheme at all, so this
// script and `pnpm run watch:device` both failed with "the workspace does not
// contain a scheme named ...".
const SCHEME = 'SparkyFitnessWatch';

console.log(`› Building ${SCHEME} scheme...`);
// Signing is disabled explicitly: a simulator build never needs it, and
// leaving it on makes the build fail on a machine whose only team is a free
// Personal Team (and on a CI runner, which has no identity at all).
execSync(
  `xcodebuild -workspace ios/SparkyFitness.xcworkspace -scheme '${SCHEME}' -destination 'generic/platform=watchOS Simulator' -quiet CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" build`,
  { stdio: 'inherit' }
);

// Find built app in DerivedData
const derivedDataPath = join(homedir(), 'Library/Developer/Xcode/DerivedData');
let builtAppPath = null;

if (existsSync(derivedDataPath)) {
  const folders = readdirSync(derivedDataPath).filter((f) =>
    f.startsWith('SparkyFitness-')
  );
  for (const folder of folders) {
    const candidate = join(
      derivedDataPath,
      folder,
      `Build/Products/Debug-watchsimulator/${SCHEME}.app`
    );
    if (existsSync(candidate)) {
      builtAppPath = candidate;
      break;
    }
  }
}

if (!builtAppPath) {
  console.error(`❌ Could not find built ${SCHEME}.app in DerivedData`);
  process.exit(1);
}

// Find an available watchOS simulator
console.log('› Finding available Apple Watch simulator...');
const { devices } = simctlJson('list devices available');

let watchDevice = null;
for (const [runtime, list] of Object.entries(devices)) {
  if (runtime.includes('watchOS')) {
    watchDevice =
      list.find((d) => d.name.includes('Apple Watch Series 11 (46mm)')) ||
      list[0];
    if (watchDevice) break;
  }
}

if (!watchDevice) {
  console.error('❌ No available watchOS simulator found.');
  process.exit(1);
}

if (shouldPair) {
  pairWithIPhone(watchDevice);
}

console.log(
  `› Booting Apple Watch Simulator: ${watchDevice.name} (${watchDevice.udid})...`
);
execSync('open -a Simulator', { stdio: 'ignore' });
try {
  execSync(`xcrun simctl boot "${watchDevice.udid}"`, { stdio: 'ignore' });
} catch {
  // Already booted
}

console.log('› Installing app on simulator...');
execSync(`xcrun simctl install "${watchDevice.udid}" "${builtAppPath}"`, {
  stdio: 'inherit',
});

console.log(`› Launching ${bundleId}...`);
// SIMCTL_CHILD_* is how `simctl launch` passes environment into the app, the
// same mechanism the CI screenshot job uses for its SPARKY_SCREENSHOT_* flags.
execSync(`xcrun simctl launch "${watchDevice.udid}" "${bundleId}"`, {
  stdio: 'inherit',
  env: fakeHeartRate
    ? { ...process.env, SIMCTL_CHILD_SPARKY_FAKE_HR: '1' }
    : process.env,
});

console.log('✔ Apple Watch App launched successfully!');
if (fakeHeartRate) {
  console.log(
    '  Synthetic heart rate is on. It produces nothing until a workout is\n' +
      '  armed, so start a preset on the phone before expecting a BPM.'
  );
}

/**
 * Pairs the watch simulator to an iPhone simulator so WCSession has a
 * counterpart.
 *
 * Prefers an iPhone that is already booted, since that is almost certainly the
 * one `pnpm run ios` just started and therefore the one running the phone app.
 * A simulator belongs to at most one pair, so an existing pair for this watch
 * is either reused as-is or broken first — pairing over it fails rather than
 * replacing it.
 */
function pairWithIPhone(watch) {
  const phone = findIPhone();
  if (!phone) {
    console.error('❌ No available iPhone simulator to pair with.');
    process.exit(1);
  }

  const { pairs } = simctlJson('list pairs');
  const existing = Object.entries(pairs).find(
    ([, pair]) => pair.watch.udid === watch.udid
  );

  let pairId = existing?.[0];
  if (existing && existing[1].phone.udid !== phone.udid) {
    console.log('› Unpairing the watch from a different iPhone...');
    execSync(`xcrun simctl unpair "${existing[0]}"`, { stdio: 'inherit' });
    pairId = undefined;
  }

  if (pairId) {
    console.log(`› Reusing the existing pair with ${phone.name}.`);
  } else {
    console.log(`› Pairing ${watch.name} with ${phone.name}...`);
    pairId = execSync(`xcrun simctl pair "${watch.udid}" "${phone.udid}"`, {
      encoding: 'utf-8',
    }).trim();
  }

  console.log(`› Booting ${phone.name}...`);
  try {
    execSync(`xcrun simctl boot "${phone.udid}"`, { stdio: 'ignore' });
  } catch {
    // Already booted
  }

  try {
    execSync(`xcrun simctl pair_activate "${pairId}"`, { stdio: 'ignore' });
  } catch {
    // Best effort: a pair that is already the active one has nothing to
    // change, and simctl treats that as an error.
  }

  console.log(
    `✔ Paired with ${phone.name}. Install and launch the phone app there\n` +
      '  (pnpm run ios) if it is not already running, then start a workout\n' +
      '  preset on it to arm the watch.'
  );
}

function findIPhone() {
  const iPhones = Object.entries(devices)
    .filter(([runtime]) => runtime.includes('iOS'))
    .flatMap(([, list]) => list)
    .filter((device) => device.name.startsWith('iPhone'));
  return iPhones.find((device) => device.state === 'Booted') ?? iPhones[0];
}
