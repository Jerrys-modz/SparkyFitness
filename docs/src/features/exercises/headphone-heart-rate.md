# Headphone Heart Rate

AirPods Pro 3 can measure your heart rate. SparkyFitness reads it during a live strength workout, so you get a heart rate on the exercise you are doing without wearing a watch.

## What you need

- An iPhone on iOS 26 or later, running the SparkyFitness app.
- AirPods Pro 3 connected to the phone.
- A live workout started in the app.

Turn on **Headphone heart rate** in Settings → Workout Settings. It is off by default, and the row only appears on a phone that can use it. Once it is on, the phone starts listening when a live workout starts.

## With a watch

The phone and the watch share the job, and whichever has recent readings is used. If an Apple Watch is paired, the watch measures your heart rate as before. If it has sent nothing for about 45 seconds (you left it at home, took it off, or it is out of range), the phone uses your AirPods instead. When the watch starts sending again, it takes over and the phone stops. Apple chooses between a watch and AirPods by how accurate the last 5 minutes were, which the app cannot see, so SparkyFitness goes by which one is giving readings.

## What you see

- The current heart rate shows on the exercise you are on, as it does with a watch.
- When the workout is saved, each exercise carries its average and maximum heart rate and time in each [heart rate zone](/features/exercises/heart-rate-zones).
- Under the heart rate, a label says where it came from: **Apple Watch** or **Headphones**. It shows on a strength workout's exercises, on a run or walk recorded with the watch (the **Avg heart rate** tile reads "Avg heart rate · Apple Watch"), and on the activity screen. Workouts synced from Apple Health, Garmin and other sources show no label, because the app cannot tell what measured them. Runs and workouts saved before this label existed show none either, and nothing is added to them afterwards.

## When the phone locks or the app closes

- **Locked phone:** your phone usually locks between sets. The readings keep being taken and are caught up when you unlock it, so the workout still has them. The first time a workout session starts, iOS may show a prompt saying workout data will be available to the app while the phone is locked. Allow it.
- **App closed:** if the app is closed or restarted during a workout, it picks the heart-rate session back up when you open it again, and ends it if the workout is already over.

## Good to know

- Readings are kept on the phone while the workout runs and sent when you finish. If the server cannot be reached, they are sent when it comes back.
- The phone's own workout session is thrown away when you finish, so your Apple Health does not get a second copy of the workout. The heart rate is stored with your SparkyFitness workout only.
- Discarding a workout discards its heart rate too.
- Android and iPhones before iOS 26 have no headphone heart rate.
