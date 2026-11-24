# Check-In

The Check-In page in SparkyFitness allows you to quickly log your daily progress, including meals, exercises, and other key metrics. The page is split into six tabs.

## Measurements tab

Log your weight, height, steps, body metrics, and any custom categories you've created. See [Measurements](/features/measurements) for more information.

### Hunger & fullness

The **Hunger & fullness** card at the top of the Measurements tab is a short daily check-in for anyone watching what they eat, whether or not you take medication. Rate three things from 0 (not at all) to 10 (extremely):

- **Hunger** – how hungry you felt during the day.
- **Fullness** – how full and satisfied your meals left you.
- **Cravings** – how much you kept thinking about food or wanted something specific.

Pick the day with the date control and press **Save check-in**. You can come back and change a day's scores at any time; saving again replaces them. In the mobile app the same card sits at the top of **Measurements**.

The scores are saved as daily measurements, so they appear in [Reports](/features/reports) next to the calories you ate each day. If you use the GLP-1 daily check-in on the Medications page, it is the same check-in: hunger, fullness and cravings (called *food noise* there) are stored once per day, and whichever card you save from, the other shows the same values. The GLP-1 card also asks about energy.

The card can be switched off separately on the website and in the mobile app (the `appetite` optional feature). Switching it off only hides the card and its report; your saved scores stay. People with Check-in access to your account (see [Family & Friends sharing](/features/family-friends-sharing)) can see and log these scores, as with any other measurement.

## Fasting & Mood tab

The top of this tab has two cards side by side:

**Fasting card**: shows your current fast or eating window. You can:

- Start a fast from the card (choose a preset or custom hours)
- Watch the live timer count down (or up during your eating window)
- Edit or delete any fast from the **Recent Fasts** list below

Fasting behavior (the calorie threshold, pre-goal warning, and alerts) is configured under **Settings → Nutrition & Diet → Intermittent Fasting**. Your fasting history and stats live in [Reports](/features/reports).

**Mood card**: answer "How are you feeling today?":

- Set your **Overall mood** with the slider (or tap the emoji face under it): 15 built-in moods from *Sad* to *Excited*
- Tick any number of mood **tags** that also apply (for example: *sensitive*, *tired*, *anxious*)
- Manage which moods show up, and add your own custom moods, from the **Manage** button
- Add free-text **notes**
- Press **Save Mood**

Your mood over time is available through [Reports](/features/reports).

### Several check-ins a day

On the web Check-In page, open the **Fasting & Mood** tab. The left card is the composer, titled **New check-in** (or **Edit check-in** while you change one). It has a Time field, the mood picker, Energy, Focus, tags and a Journal. The Time field starts at the current time when you are on today, and stays on it until you set it yourself; on any other day it starts at 12:00. Every field is optional, but saving a check-in requires at least one content field: mood, energy, focus, tags, or a note (setting the time alone does not allow saving).

The right side lists the day's check-ins in time order, with the day's average mood, energy and focus above the list. Each check-in has an edit button and a delete button, and deleting asks you to confirm. A check-in without a mood is listed without a face and is left out of the average mood. The fasting card sits under the list.

Moods imported from Garmin or a file are not listed here and can't be edited. In Reports, the mood chart shows one value per day: the average of the moods you logged that day, or the Garmin or imported mood when you logged none. Its tooltip shows how many check-ins the day has.

The mobile app lists every check-in too. On the Dashboard, the mood card shows one mood per day and opens a day view with the day's check-ins in time order and the day's averages. Tap a check-in to edit it, swipe it to delete it, or choose **Add check-in** for a new one. The composer has the same optional fields as the web, and the mood can be left unset by tapping the selected face. The mood report and chart show one value per day. If your server is older and only keeps one mood per day, the app keeps the single-entry screen. If the app can't reach your server to check which kind it is, the mood screens show **Retry** instead of a form.

## Mindfulness tab

A small daily space for breathing and meditation:

- **Today's stats**: mindful minutes and the number of sessions recorded so far today
- **Paced Breathing**: a breathwork guide with three patterns:
  - **Box Breathing** (4-4-4-4) for focus and stress relief
  - **4-7-8 Relaxation** for deep calm and sleep prep
  - **Coherent Resonance** for HRV maximization

  Press **Begin Breathing**, follow the Inhale / Hold / Exhale / Rest prompts, and the session is logged when you press **Complete**.
- **Meditation Timer**: run an open or timed session with **Start Timer**, **Pause**, and **Save & Finish**
- **Today's Sessions**: log a session manually (type: *Meditation* or *Breathwork*, minutes and seconds), or edit and delete past sessions

## Blood pressure tab

Log blood pressure readings by hand and follow them over time. Readings that arrive from a connected device or from Health Connect, Apple Health, Withings or Garmin appear in the same list.

- **Log a reading:** systolic, diastolic (mmHg) and optionally pulse, time, arm, body position and a note. It is saved on the day you have selected.
- **Category:** each reading shows a category (Normal, Elevated, Stage 1, Stage 2, Severe) from the AHA/ACC adult thresholds. When systolic and diastolic fall in different categories, the higher one is shown. This is information, not a diagnosis.
- **Trend:** the last 7, 30 or 90 days, with the average, a morning average (before noon), an evening average (from 17:00) and a **home average**.
- **Home average:** follows the usual home-monitoring approach: the first day of readings is left out and the rest averaged, and it needs readings on at least 5 different days. A home average at or above 135/85 is flagged, because the home cutoff is lower than the clinic one.
- **Editing:** readings you logged by hand can be edited or deleted. Readings that came from a device can only be deleted, since the next sync would rewrite an edit; a deleted device reading can come back when it syncs again.
- **Family access:** a profile you view through Family Access shows the readings, but only the account owner can log them here.

On the mobile app, open **Library → Blood pressure** for the same list, averages and trend, and use **+** to add a reading. Press and hold a reading to delete it.

You can hide it in **Settings → Profile & Account → Features → Blood pressure** on the website and **Settings → Features** in the app. Each app has its own switch. This only hides it; nothing is deleted.

## Sleep tab

Log your sleep for the selected day:

- A day can have multiple **sleep sessions** (for example, a main sleep plus a nap)
- Enter **Bedtime** and **Wake Time** for each session, then press **Save Sleep**

Sleep duration and quality feed the sleep section of [Reports](/features/reports), and your target bedtime (set under [Preferences](/features/settings/preferences)) is used for caffeine sleep-impact estimates on the Diary.

## Photos tab

Upload **progress photos** to track your progress over time:

- Three slots per day: **Front**, **Back**, and **Side**
- Tap a slot to upload, or **Replace** / delete an existing photo
- Days with photos are marked in the calendar on the Check-In page and the date navigator

## Symptoms tab

A quick way to log symptoms and episodes from your daily check-in. For templates, severity scales, location maps, triggers, and clinician-ready exports, see [Symptom & Episode Tracking](/features/symptom-tracking).

## Guided check-in (mobile app)

In the mobile app, **Daily Check-In** in the **+** menu walks you through your daily check-in for the day the Diary is on, one screen after another:

1. **Mood**: how you are feeling, with the same fields as the mood screen.
2. **Measurements**: your weight and body measurements.
3. **Progress photos**: front, back and side.

Each screen shows **Step N of 3**. **Save & continue** saves the step and opens the next one; on the measurements step it moves on without saving when you changed nothing. **Skip** moves on without saving, asking first if you changed something, and is how you leave the mood step without logging a mood. **Back**, on the measurements and photos steps, opens the step before with what you saved there, so you can change it; going back to the mood step edits the mood you logged rather than adding another. On the photos step, **Finish** closes the check-in, and so do the close button, your phone's Back button (Android) and swiping the screen down (iPhone), since photos are saved as you add them; the **Back** in the step bar only returns to the measurements step. Anything you saved stays saved, even if you close the check-in part-way. If you close it, or the phone closes the app, before the photos step is done, tapping **Daily Check-In** again for the same day asks whether to **Continue** where you stopped or **Start over** with a new check-in.

The check-in keeps to logging the day, so the photos step leaves out **Compare**, **Time-lapse** and the **Log weight** shortcuts (weight has its own step). Open Progress Photos from the Add menu for those.

Like any other item in the **+** menu, you can move or hide **Daily Check-In** in **Settings → Quick Actions**.

## Weigh-in reminders (mobile app)

Adaptive TDEE and the weight trend work best with regular weigh-ins, so the mobile app can remind you. Turn it on in **Settings → Notifications → Weigh-ins**, then pick:

- **Time**: when the reminder arrives (7:30 AM by default).
- **Days**: every day by default. Pick fewer, for example only Monday, if you prefer to weigh in weekly. At least one day stays selected.

Tapping the reminder opens the **Measurements** step of Check-In on today, with the weight field ready to type in.

Reminders repeat every week on the days you picked, so they keep coming even if you don't open the app for a while.

If a weight is already logged for today, whether you entered it or it synced from Apple Health or Health Connect, today's reminder is skipped, or removed from your notifications if it was already shown, and the following weeks carry on as usual. The app checks when it opens, when you return to it, after you save a check-in, and during background sync. On iPhone, with background sync and weight syncing on, a weight your scale writes to Apple Health wakes the app to check right away. A weight logged on the website or another device while the app is closed is only seen at the next background sync, so if none runs before the reminder time, that day's reminder still arrives.

The reminder is phrased as an invitation, never a judgement, and skipping a day is fine. Like the other reminders it needs **Allow Notifications** on and notification permission granted, and the setting stays on the phone.
