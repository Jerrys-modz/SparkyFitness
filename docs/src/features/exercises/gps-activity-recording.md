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

You can tap **Discard** at any point, while recording or paused as well as after finishing. You'll be asked to confirm first.

If you leave the screen mid-recording, it doesn't disappear. A bar appears above the tab bar, the same as for a strength workout, with the elapsed time, distance and pace. Use it to pause or resume, or discard, and tap it to go back to the recording. A finished recording that hasn't been saved stays there too, with a check mark that opens it so you can save it.

The saved activity is an ordinary diary entry with its route, distance, elevation gain and loss, and splits. It appears in Exercise Statistics and opens in the same cardio session view as activities imported from Garmin, Apple Health or Health Connect.

Distance, pace and splits follow your distance unit (kilometres or miles).

---

## Indoor and treadmill sessions

For a treadmill or any session without GPS, choose **Indoor** under the activity before you tap **Start**. No location access is asked for and no route is recorded. You get the clock and pause and resume, and a paired Apple Watch still adds your heart rate.

When you tap **Finish**, you can enter the distance your treadmill or machine shows. It's optional: leave it empty to log just the time. The distance is used as you typed it, in your distance unit.

### Estimated distance and learning your stride

On an iPhone, the distance field is filled in for you from your phone's step count and your stride length. The first time, iOS asks for Motion & Fitness access so SparkyFitness can read your steps. Paused time is left out.

A phone can't measure treadmill distance exactly, so treat the estimate as a starting point:

- **At first it's rough.** Until the app has learned your stride it uses a typical one, and the screen says so.
- **Change it to match your treadmill.** When you correct the distance, the app works out your stride from it and uses that next time. It learns walking and running separately, and the estimate gets closer over a few sessions. If you leave the estimate as it is, nothing is learned.
- **Outdoor recordings help too.** A saved outdoor walk or run, whose GPS distance is known, also teaches the app your stride if you've already allowed Motion & Fitness access. It never asks for access just to learn.

Your stride is kept on your phone only. On Android, or if you don't allow access, the field starts empty and you type the distance. There's no step estimate for a ride.

The saved activity is logged as **Indoor Walking**, **Indoor Running** or **Indoor Cycling**, and has no route or splits.

---

## Nothing is lost if the connection drops

Points are saved on the phone as they arrive. Nothing is sent to your server until you tap **Save activity**, so a dropped connection or a closed app doesn't lose the activity. If the app is closed mid-recording, reopen **Record Activity** to pick it back up. If saving fails, the recording stays on the phone so you can try again; retrying never logs the activity twice.

---

## Auto-pause

Turn on **Auto-pause** before you start and the recording pauses itself when you stop (a red light, tying a shoe) and carries on when you move again. It judges speed from the GPS, so it works with the screen locked. The clock stops from the moment you actually stopped, not from when the pause was noticed, and restarts from when you began moving. A rolling start is needed to resume, so a shuffle in place won't restart it. It waits about 10 seconds when walking, 8 running and 6 riding before pausing.

A pause you make yourself is never undone automatically; only an auto-pause resumes on its own. You can resume an auto-pause by hand at any time. The choice is remembered for next time.

---

## Recording with the screen locked

- **iOS:** recording keeps running in the background and the status bar shows the blue location indicator. Only "while using the app" location access is needed.
- **Android:** recording runs as a foreground service with a notification while it's active. Only location access while using the app is needed, not "all the time".

Some Android phone makers stop background apps aggressively. If a recording has gaps, set SparkyFitness to **Unrestricted** in the phone's battery settings. [dontkillmyapp.com](https://dontkillmyapp.com) has steps for specific brands.

---

## With an Apple Watch

If you have a paired Apple Watch with the SparkyFitness app, it follows a recording the phone makes:

- The watch opens on a recording page showing the clock, distance and pace, with your current heart rate beside the status.
- Pause, resume and finish work from your wrist. Finishing stops the recording and the page tells you to save it on your iPhone.
- The watch measures your heart rate during the activity. It shows live on the watch and on the phone's recording screen (the phone shows it while the watch is in range). After you save, the average, maximum and time in each heart-rate zone appear on the activity.

Nothing is written to Apple Health from the watch until you decide. Saving the activity on your iPhone adds the workout to Apple Health; discarding it doesn't.

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
