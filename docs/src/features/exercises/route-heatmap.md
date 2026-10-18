# Route Heatmap

The heatmap shows everywhere you have run, walked, ridden or hiked, drawn over a map: brighter where you have been more often. It is built from the GPS tracks already stored with your activities.

It is **yours alone**. The server builds it from the signed-in person's own tracks, refuses the request when you are acting for someone else, and there is no way to share it.

---

## Where to find it

- **Mobile:** **Library → Heatmap**, or **Library → Routes → Heatmap**.
- **Web:** **Reports → Exercise**, in the *Route heatmap* card (shown in the *All* and *Cardio* views, and hidden when you are acting for someone else).

## Using it

- Choose an **activity** (*All*, *Run*, *Walk*, *Ride*, *Hike*) and a **period** (*30 days*, *90 days*, *Year*, *All time*).
- Pan and zoom. Zooming in shows finer detail: the grid cells shrink from a few kilometres across down to 25 m.
- **Tap or click the map** to see how many times that spot was used. When the map is zoomed out the count is the busiest road in that square, and the card says so.
- A legend and a count of activities and the dates they cover sit under the map. When there are more places than the map can draw it keeps the busiest and tells you to zoom in or choose a shorter period.

On an Android build without a Google Maps key (see [GPS Activity Recording](./gps-activity-recording.md)) the mobile app draws the same grid without a map underneath and without tap-to-count.

## How it is built

Each activity adds one to every 25 m cell its line passes through, however many GPS fixes landed there, so standing still does not make a place "hotter". The gaps between fixes are filled in, except across a pause longer than five minutes or a jump of more than 500 m. Fixes with a poor accuracy radius are skipped. A coarser view merges cells and takes the highest count among them.

## Cost and limits

The expensive part is reading tracks, so the server does it once and caches it:

- A person's grid (for the chosen activities and dates) is built by reading their stored tracks **eight at a time**, so memory stays bounded however long the history is. It is then cached in the server's memory until their tracks change (an activity added, replaced or removed), and panning or zooming is served from the cache.
- When the only change is new activities, the cache is extended with just those instead of being rebuilt.
- A grid holds at most 400,000 cells; a very large history keeps the newest activities first and the response says it was truncated. A response carries at most 5,000 cells (the apps ask for 900 and 2,500).
- At most 24 grids are cached in total, and the endpoint is limited to 120 requests per user per 10 minutes.

On a development machine with PostgreSQL 16 and a synthetic history of 2,000 activities (1.6 million GPS fixes, 60 MB of stored tracks) a first request took about 3.5 s, later views about 30 ms, and adding one activity about 40 ms. Your own history and hardware will differ; see the notes in the developer section below.

## For developers

`GET /api/v2/heatmap` takes `activities` (comma list), `from`, `to` (`YYYY-MM-DD`), the four viewport corners (`minLat`, `maxLat`, `minLon`, `maxLon`, all or none) and `maxCells`. It returns `{ cellM, cells: [lat, lon, count][], maxCount, activityCount, truncated, bounds, firstDate, lastDate }`. The contract is `shared/src/schemas/api/Heatmap.api.zod.ts`, the grid maths is the pure `shared/src/utils/heatmap.ts`, and the server side is `services/heatmapService.ts` over `models/heatmapRepository.ts`. There is no new table: it reads `exercise_entry_gps_points`, whose owner policy is unchanged for the diary but which this endpoint only ever queries as the signed-in person.
