#!/usr/bin/env bash
# Photographs the Wear debug build on a booted emulator. The launch extras
# fill the pages; a Wear emulator has no paired phone.
set -euo pipefail

PKG=org.SparkyApps.SparkyFitnessMobile1.dev
ACT=com.sparkyapps.sparkyfitness.wear.MainActivity
APK=SparkyFitnessMobile/targets/wear/app/build/outputs/apk/debug/app-debug.apk
OUT=SparkyFitnessMobile/screenshots

mkdir -p "$OUT"
adb install -r "$APK"

shoot() {
  adb shell am force-stop "$PKG" || true
  adb shell am start -W -n "$PKG/$ACT" \
    --es sparky.screenshot 1 \
    --es sparky.workout "$2" \
    --es sparky.page "$3"
  sleep 6
  adb exec-out screencap -p > "$OUT/$1.png"
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
