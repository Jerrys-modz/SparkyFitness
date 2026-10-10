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

## Start countdown

Pick **3 s**, **5 s** or **10 s** under **Start countdown** and tapping **Start** counts down before the recording begins, so you can put the phone away and get moving. Each number is felt as a tap and, with voice cues on, spoken. **Cancel** stops the countdown without recording anything. It's off by default and remembered. The first time you record, the location permission prompt appears after the countdown.

---

## Laps and the run summary

While recording, tap **Lap** to mark a lap, for example at the end of a hard interval or at each lap of a track. It's available while the recording is running, not while paused, and a second tap within three seconds is ignored. With voice cues on, the phone says the lap number, distance and time.

When you finish, the summary lists your laps and your splits per kilometer or mile. Each row has a bar, longer for a faster one, and the fastest is labelled, so a fading last kilometer or a strong negative split is easy to see. A short final stretch is shown but never counted as your fastest.

After saving, opening the activity from Exercise Statistics shows a **Pace** chart next to the route and heart rate: pace against distance, with faster stretches higher, and your best pace above it. It works for any activity with a GPS route, including imported ones, and leaves out the time you stood still.

If you marked laps, those are what's saved with the activity, because they're the intervals you meant to compare. If you didn't, your per-kilometer or per-mile splits are saved as before.

---

## Auto-pause

Turn on **Auto-pause** before you start and the recording pauses itself when you stop (a red light, tying a shoe) and carries on when you move again. It judges speed from the GPS, so it works with the screen locked. The clock stops from the moment you actually stopped, not from when the pause was noticed, and restarts from when you began moving. A rolling start is needed to resume, so a shuffle in place won't restart it. It waits about 10 seconds when walking, 8 running and 6 riding before pausing.

A pause you make yourself is never undone automatically; only an auto-pause resumes on its own. You can resume an auto-pause by hand at any time. The choice is remembered for next time.

---

## Voice cues

Turn on **Voice cues** before you start and the phone speaks as you go: your total time and the time of the last kilometer or mile each time you complete one, and "Paused", "Auto paused" or "Resumed" when that happens. It also says your distance and time when you finish. Cues use the distance unit from your settings and the app language, and they're spoken with the screen locked and the phone's silent switch on. If you're playing music it keeps playing, and it dips while a cue is spoken when **Lower music during cues** is on.

The setting is off by default and is remembered for next time. Cues are spoken by the phone, so use earphones or a watch speaker if you don't want them out loud.

---

## Intervals

Under **Intervals** on the Record screen, pick a timed plan before you start: a beginner run/walk (a 5 minute warm-up, 8 rounds of 1 minute running and 1 minute 30 seconds walking, a 5 minute cool-down), longer run/walk blocks, or speed repeats such as 3 minutes fast with 2 minutes easy. **Custom** lets you set the warm-up, the work and recovery times, the number of rounds and the cool-down, and choose whether the steps are called "Run" and "Walk" or "Fast" and "Easy".

While you record, a card shows the current step, the time left, the round and what comes next. At each change the phone buzzes, and with **Voice cues** on it tells you what to do ("Run. 1 minute."). The steps run on the recording clock, so a pause (by hand or auto-pause) holds the step where it was and a long stop does not use up the interval.

Each step also becomes a lap, so the saved activity is split into your work and recovery stretches and the pace bars show the difference. When the last step ends you hear "Intervals complete" and can carry on or finish.

Intervals work with phone recording only for now. The watch does not show the steps yet.

---

## Training programs

If you are starting to run, the Record screen offers **Beginner 5K**: nine weeks, three runs a week. Each run is a timed plan (a 5 minute warm-up, alternating running and walking, a 5 minute cool-down), starting with 1 minute of running and building up to 30 minutes of running in week 9.

Tap **Start Beginner 5K** and the screen selects today's workout for you (Week 1, run 1 first). The card shows where you are and how long today's session is. Record it like any run: you are told when to run and when to walk.

A workout is ticked off when you get through to its last step and save the activity. If you stop early, the same workout comes up again next time. **Skip** moves past a workout you cannot do, and **Leave program** forgets your place. When you finish week 9 the card says so and offers to start again. You can still pick any other interval plan, or record without one, at any time.

Your place in the program is kept on this phone. This is a common beginner structure, not medical advice: if you are unsure about starting to run, check with your doctor first.

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
- A **Lap** button (flag) marks a lap while the recording is running, and the page shows how many you have marked. A lap is marked at the moment you press it, even if the phone is out of range and only hears about it later.
- The watch measures your heart rate during the activity. It shows live on the watch and on the phone's recording screen (the phone shows it while the watch is in range). After you save, the average, maximum and time in each heart-rate zone appear on the activity.

Nothing is written to Apple Health from the watch until you decide. Saving the activity on your iPhone adds the workout to Apple Health; discarding it doesn't.

The phone still records the route with its own GPS, so keep it with you. Heart rate is attached after the activity is saved. If the watch was out of range for part of it, the readings it held are sent when it reconnects, and the activity can be saved before that. Readings that arrive after saving are not added.

The watch's own GPS is not used, and the activity is saved to Apple Health once, from the watch, without being imported back into SparkyFitness a second time.

---

## Recording a walk or run on the watch alone

On the watch's **Workout** page, above your saved workouts, tap **Cardio** and choose **Run** or **Walk** under **Outdoor** or **Indoor**. The watch then records on its own, with no phone needed:

- The page shows the clock, distance, pace and heart rate, with pause, resume and finish.
- **Outdoors** the watch uses its own GPS for the distance and records the route. The first time, it asks for location access ("while using the app" is enough). If you say no, you still get the workout, just without a route.
- **Indoors** there is no GPS, so the distance is the watch's own estimate from its motion sensors. It gets better the more you use the watch outdoors, since Apple calibrates it from outdoor workouts.
- **Outdoor auto-pause:** when you stand still the watch pauses itself ("Auto-paused", with a tap on the wrist), and resumes when you move again. It uses the same speeds as the phone. Pausing is not backdated, so the first few seconds of standing still count. A pause you make yourself is never undone automatically. Indoors there is no GPS to tell if you have stopped, so use the pause button.
- **If the watch app closes mid-run:** open it again and the run carries on where it was. If watchOS had already ended the workout, the run is still sent to your iPhone as far as it got (provided it was at least a minute long with some distance), so the effort isn't lost. After a restart the route in Apple Health begins at that point; the activity in SparkyFitness keeps the whole route.
- Finishing saves the workout (and route) to Apple Health and sends the run to your iPhone, which logs it in your diary as a normal SparkyFitness activity with distance, heart rate, calories and the route. If the phone is out of range or offline, the run waits and is logged when they meet again.

The watch can only run one workout at a time. The page tells you if your iPhone is recording an activity or a strength workout is running, and it won't start in that case.

Unlike a recording the phone makes, a watch-only recording has no voice cues or laps yet.

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
