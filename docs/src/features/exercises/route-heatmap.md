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
- **Street level (mobile):** once the map shows less than about 3 km across, the grid gives way to your own tracks drawn as thin, semi-transparent lines. Where tracks overlap the lines stack into a brighter one, so a road you use often glows. Zoom out and the coloured grid comes back. If the lines cannot be had whole (a very busy area, or the request fails) the app keeps the grid.
- **Tap or click the map** to see how many times that spot was used. When the map is zoomed out the count is the busiest road in that square, and the card says so. In line mode the count is the number of activities with a track within a few metres of your tap.
- A legend and a count of activities and the dates they cover sit under the map. When there are more places than the map can draw it keeps the busiest and tells you to zoom in or choose a shorter period.

On an Android build without a Google Maps key (see [GPS Activity Recording](./gps-activity-recording.md)) the mobile app draws the same grid without a map underneath, without lines and without tap-to-count. The web card shows the grid only.

## How it is built

Each activity adds one to every 25 m cell its line passes through, however many GPS fixes landed there, so standing still does not make a place "hotter". The gaps between fixes are filled in, except across a pause longer than five minutes or a jump of more than 500 m. Fixes with a poor accuracy radius are skipped. A coarser view merges cells and takes the highest count among them.

## How the lines are built

For the visible map box the server returns your own stored tracks, simplified: fixes with a poor accuracy radius are dropped, a track is cut at the same pauses and jumps as the grid, and each stretch is thinned (Douglas-Peucker) to within 4 m of what was recorded, keeping at most 400 points per stretch. Coordinates are rounded to about a metre. A one-hour run of 1 Hz fixes becomes a few hundred points.

A response carries at most 300 tracks and 20,000 points by default (600 and 40,000 at most), newest activity first. When a cap stops it the response says so (`truncated`) and the app draws the grid instead, because a map that silently dropped your older runs would be wrong.

## Cost and limits

The expensive part is reading tracks, so the server does it once and caches it:

- A person's grid (for the chosen activities and dates) is built by reading their stored tracks **eight at a time**, so memory stays bounded however long the history is. It is then cached in the server's memory until their tracks change (an activity added, replaced or removed), and panning or zooming is served from the cache.
- When the only change is new activities, the cache is extended with just those instead of being rebuilt.
- A grid holds at most 400,000 cells; a very large history keeps the newest activities first and the response says it was truncated. A response carries at most 5,000 cells (the apps ask for 900 and 2,500).
- At most 24 grids are cached in total, and the endpoint is limited to 120 requests per user per 10 minutes.
- The simplified tracks are cached the same way (per activity filter and period, until your tracks change; at most 8 sets of 600,000 points, oldest activities skipped past that, which also counts as truncated), so panning the map at street level cuts from memory. Changing your tracks rebuilds the set rather than extending it. The tracks endpoint has its own limit of 120 requests per user per 10 minutes.

On a development machine with PostgreSQL 16 and a synthetic history of 2,000 activities (1.6 million GPS fixes, 60 MB of stored tracks) a first request took about 3.5 s, later views about 30 ms, and adding one activity about 40 ms. Your own history and hardware will differ; see the notes in the developer section below.

## For developers

`GET /api/v2/heatmap` takes `activities` (comma list), `from`, `to` (`YYYY-MM-DD`), the four viewport corners (`minLat`, `maxLat`, `minLon`, `maxLon`, all or none) and `maxCells`. It returns `{ cellM, cells: [lat, lon, count][], maxCount, activityCount, truncated, bounds, firstDate, lastDate }`. The contract is `shared/src/schemas/api/Heatmap.api.zod.ts`, the grid maths is the pure `shared/src/utils/heatmap.ts`, and the server side is `services/heatmapService.ts` over `models/heatmapRepository.ts`. `GET /api/v2/heatmap/tracks` takes the same `activities`, `from` and `to`, the four box corners (`minLat`, `maxLat`, `minLon`, `maxLon`, all required), `maxTracks` and `maxPoints`. It returns `{ tracks, pointCount, truncated, toleranceM }`, where each track is a list of parts and each part a list of `[lat, lon]`. The simplification and the tap-count maths are pure functions in `shared/src/utils/heatmap.ts` (`simplifyHeatTrack`, `countTracksNear`). Both endpoints are owner-only (`requireSelfActor`), never delegated or shared, and not available to the AI tools. There is no new table: it reads `exercise_entry_gps_points`, whose owner policy is unchanged for the diary but which these endpoints only ever query as the signed-in person.
