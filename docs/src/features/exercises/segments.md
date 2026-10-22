# Segments

A segment is a stretch of road or trail you want to time yourself on: the climb at the end of your street, the straight by the river, the last kilometre of your usual loop. Every time you run, walk or ride over it, SparkyFitness works out how long you took, keeps the result and shows how your times change.

Segments here are **personal only**. SparkyFitness is self-hosted for you and your household, so there is no community: no leaderboards, no one else's times, and nothing is ever shared or delegated. You compete with your own earlier self.

---

## Making a segment

You can cut a segment from either of two places in the mobile app:

- **From a saved route.** Open the route (**Library → Routes**) and tap **Create segment** in its *Segments* card.
- **From a recorded run, walk or ride.** Open the activity's details and tap **Create segment** under its route map. The activity needs a GPS track.

Then:

1. Drag the two handles along the bar to choose where the segment starts and ends. The map shows your choice over the whole line. The **−** and **+** buttons move a handle 50 m at a time, which is also how you do it with a screen reader.
2. Optionally give it a name and choose the activity: **Run**, **Walk**, **Hike** or **Ride**.
3. Tap **Save segment**.

A segment must be between **100 m and 100 km** long. You can keep up to **500**. SparkyFitness simplifies the line it stores (at most 400 points) and measures the length on the full track.

Right after saving, the server searches your **past** activities for passes over the new segment. It keeps going in batches until it has read them all; you can leave the screen and come back.

---

## How a pass is timed

For each recorded activity the server checks whether the GPS track passes over the segment, and if so how long it took between the start and the end. A pass counts only when:

- **The track stays near the line.** Every fix between start and end is within 25 m of the segment.
- **It goes the right way.** The track crosses the start going forward and the end going forward. Running the segment the other way is not an effort, and neither is turning round part-way.
- **The GPS is trustworthy.** Fixes with a poor accuracy radius (over 50 m) are ignored, and the pass is dropped if that leaves a gap of more than 30 seconds or 150 m, if a single jump implies more than 25 m/s, or if the recording is otherwise too sparse to time.

The time is **interpolated** between the two fixes either side of each crossing, so it does not depend on a fix landing exactly on the start or the end. A recording that begins just inside the start of a segment is timed from where it began, extrapolated at its first speed. The clock is wall-clock time between the two crossings: if you stand at a traffic light on the segment, that is part of your time.

A run-type segment (run, walk, hike) is matched by activities on foot; a ride segment only by rides. An activity whose name does not say which it is ("Evening activity") is still tried, because its track still has to pass the segment in the right direction at a believable speed.

If a track is replaced (for example you re-upload it), its results are cleared and matched again.

---

## What you see

**Library → Routes → Segments** lists your segments with your best time, how many efforts you have and when the last one was.

Open one to see:

- the segment on a map, its length, your **best time**, the **number of efforts** and the **last effort**;
- a chart of your times in the order you ran them, faster higher, with each **new record** marked;
- every effort, newest first, with the gap to your best. The best is marked **BEST**, and an effort that was a record when you set it (but was later beaten) is marked **PR**. Tap one to open that run;
- **Find past efforts**, to search again (it is quick when nothing is new), **Rename** and **Delete**.

On the **run summary** after you save a recording, a *Segments* card lists each segment the run crossed with your time. When the run is faster than all your other times on a segment, the card says **New segment PR** and what it beat. The same screen is correct even if the server is still matching the run in the background, because it matches any segment it has not checked yet when asked.

---

## Privacy and limits

- Segments and the times on them are in two tables (`segments`, `segment_efforts`) that only you can read or write. They are never part of Family & Friends access; a family member acting for you cannot open them. See [Family & Friends Sharing](../family-friends-sharing.md).
- Matching reads only your own stored GPS tracks. Nothing is sent to any outside service.
- Matching is asked for through the API with a limit of 60 calls per 10 minutes; each call reads up to 100 activities.
- Deleting a segment deletes its stored efforts. Deleting an activity deletes its efforts. The activities themselves are never changed.

## For developers

The endpoints are under `/api/v2/segments` (list, create, read with efforts, rename, delete, `POST /{id}/match`, and `GET /entries/{entryId}/efforts`). The contract is in `shared/src/schemas/api/Segment.api.zod.ts` and the matching geometry is the pure `shared/src/utils/segmentMatch.ts`. Matching also runs automatically after a GPS track is attached to an activity (`POST /api/exercise-entries/{id}/gps-track`), as a best-effort step that never delays or fails the save.
