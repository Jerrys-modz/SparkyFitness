#!/usr/bin/env bash
# Photographs the Wear debug build on a booted emulator. The launch extras
# fill the pages; a Wear emulator has no paired phone.
set -euo pipefail

PKG=org.SparkyApps.SparkyFitnessMobile1.dev
ACT=com.sparkyapps.sparkyfitness.wear.MainActivity
APK=SparkyFitnessMobile/targets/wear/app/build/outputs/apk/debug/app-debug.apk
OUT=SparkyFitnessMobile/screenshots

ADB="${ANDROID_HOME:-/usr/local/lib/android/sdk}/platform-tools/adb"
SERIAL=emulator-5554

mkdir -p "$OUT"
echo "Installing $APK"
"$ADB" -s "$SERIAL" devices -l
timeout 180 "$ADB" -s "$SERIAL" install -r --no-streaming "$APK"

shoot() {
  echo "Shooting $1"
  timeout 15 "$ADB" -s "$SERIAL" shell am force-stop "$PKG" || true
  timeout 20 "$ADB" -s "$SERIAL" shell am start -n "$PKG/$ACT" \
    --es sparky.screenshot 1 \
    --es sparky.workout "$2" \
    --es sparky.page "$3"
  sleep 6
  timeout 20 "$ADB" -s "$SERIAL" exec-out screencap -p > "$OUT/$1.png"
}

shoot workout-active active workout
shoot workout-resting resting workout
shoot workout-idle none workout
shoot workout-exercises exercises workout
shoot goals none goals
shoot water none water
shoot check-in none entry
shoot trend none trend
ls -la "$OUT"
