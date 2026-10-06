# GPS Activity Recording

Record a walk, run or ride with your phone's GPS in the mobile app. It works on both iOS and Android, and recording continues with the screen locked.

---

## Recording an activity

1. Tap **Add** → **Record Activity**.
2. Choose **Walk**, **Run** or **Ride**, then tap **Start**. The first time, allow location access while using the app.
3. While you move you'll see a live map, elapsed time, distance, average pace, current pace and elevation gain.
4. Tap **Pause** to stop the clock (for a traffic light, say) and **Resume** to carry on. Time and distance during a pause aren't counted.
5. Tap **Finish** when you're done. You'll see the route, your totals and per-km (or per-mile) splits.
6. Tap **Save activity** to add it to your diary, or **Discard** to throw it away.

The saved activity is an ordinary diary entry with its route, distance, elevation gain and loss, and splits. It appears in Exercise Statistics and opens in the same cardio session view as activities imported from Garmin, Apple Health or Health Connect.

Distance, pace and splits follow your distance unit (kilometres or miles).

---

## Nothing is lost if the connection drops

Points are saved on the phone as they arrive. Nothing is sent to your server until you tap **Save activity**, so a dropped connection or a closed app doesn't lose the activity. If the app is closed mid-recording, reopen **Record Activity** to pick it back up. If saving fails, the recording stays on the phone so you can try again; retrying never logs the activity twice.

---

## Recording with the screen locked

- **iOS:** recording keeps running in the background and the status bar shows the blue location indicator. Only "while using the app" location access is needed.
- **Android:** recording runs as a foreground service with a notification while it's active. Only location access while using the app is needed, not "all the time".

Some Android phone makers stop background apps aggressively. If a recording has gaps, set SparkyFitness to **Unrestricted** in the phone's battery settings. [dontkillmyapp.com](https://dontkillmyapp.com) has steps for specific brands.

---

## With an Apple Watch

If you have a paired Apple Watch with the SparkyFitness app, it follows a recording the phone makes:

- The watch opens on a recording page showing the clock, distance and pace.
- Pause, resume and finish work from your wrist. Finishing stops the recording and the page tells you to save it on your iPhone.
- The watch measures your heart rate during the activity. After you save, the average, maximum and time in each heart-rate zone appear on the activity.

The phone still records the route with its own GPS, so keep it with you. Heart rate is attached after the activity is saved. If the watch was out of range for part of it, the readings it held are sent when it reconnects, and the activity can be saved before that. Readings that arrive after saving are not added.

The watch's own GPS is not used, and the activity is saved to Apple Health once, from the watch, without being imported back into SparkyFitness a second time.

---

## How the numbers are worked out

- Fixes with a poor accuracy radius, impossible jumps and standing-still jitter are filtered out.
- Elevation gain and loss are measured on smoothed altitude, and only count once a climb or descent passes a small threshold, so a flat route doesn't gain metres from GPS noise.
- Splits are cut at exact kilometre or mile marks, and a short final stretch is kept as a partial split.

---

## Maps on Android

The route map uses Apple Maps on iOS. On Android it uses Google Maps when the build was made with a Google Maps API key; without one, Android shows the route as a plain line instead. See [Environment Variables](/install/environment-variables) for `GOOGLE_MAPS_ANDROID_API_KEY`.

---

## Not included yet

- Live Activity and lock-screen stats.
- Tracking with the watch's own GPS, on Apple Watch or Wear OS, so the phone can stay behind.
- Wear OS controls and heart rate.
