# Dumbbell and One-Sided Volume

Volume is the weight you lifted times the reps you did, added up. The weight you log stays exactly as you typed it, but whether it is the whole load or only half of it depends on the exercise. Each exercise has a **Volume counting** setting that says how.

## The three settings

| Setting | The logged weight and reps mean | Volume for 3 sets of 10 at 20 kg |
| --- | --- | --- |
| **Total load** (default) | The weight is the whole load and the reps are the total. A barbell, or one dumbbell held for a goblet squat. | 600 kg |
| **Weight per hand** | The weight is one of two dumbbells, so each rep moved twice that. | 1,200 kg |
| **Reps per side** | The reps are for each side. A set you logged once, with no side, counts both sides. A set marked **Left** or **Right** counts once. | 1,200 kg when each set is logged once; also 1,200 kg when you log a left set and a right set each time (600 kg per side) |

Equipment alone never doubles anything: a dumbbell exercise stays on **Total load** until you change it, because many dumbbell exercises use a single weight.

## Change it

Open the exercise in the exercise library and pick **Volume counting**. Changing it also updates the entries you have already logged for that exercise, so your history, imports from other apps included, is counted the same way from then on. Entries logged by other people are not touched. Exercises you have not changed keep counting as **Total load**.

API clients and imports can send `load_convention` (`total`, `per_hand` or `per_side`) when they create or update an exercise.

## What it changes

Only volume: the training volume totals and charts in Reports, Exercise Statistics, muscle group volume, comparisons and the workout screens. Estimated one-rep max, weight records and personal bests keep using the weight as you logged it, so a 20 kg dumbbell press still shows a 20 kg based record. Rep counts stay as logged. Calorie estimates are unchanged.

## Marking a side

On the web, hover a set row and use the **L / R / LR** button to cycle left, right and both. On the phone's live workout, tap the set number and choose **Left side**, **Right side** or **Add other side**; the Apple Watch has the same under Set options. A set with no side did both sides.
