# Route Generation

SparkyFitness can generate a run, walk, ride or hike route for you: a loop or out-and-back of a distance you choose, or a route through points you pick. The result is a preview with turn-by-turn cues; saving it adds it to your saved routes.

Route generation is **optional and off until a routing provider is added**. SparkyFitness doesn't ship a routing engine and the server needs no extra container or environment variable: you add a Valhalla routing service as an external provider, the same way you add Mealie or Hevy. Until one is added, the app reports the feature as unavailable.

---

## Which engine, and why Valhalla

SparkyFitness supports [Valhalla](https://valhalla.github.io/valhalla/) first. Valhalla returns turn-by-turn maneuvers directly, which map straight onto the cues a phone speaks or shows during a route, and it has separate pedestrian and bicycle profiles. It's a single container that builds its own routing graph from an OpenStreetMap extract, so it's easy to self-host. GraphHopper has a native round-trip algorithm but is heavier to self-host; OSRM is the simplest to run but returns no usable turn cues. Valhalla has no round-trip mode, so SparkyFitness builds loops itself: it places waypoints round a circle sized for your distance, asks the engine for the route, and, if the result is more than 10% off, resizes the circle and tries again (up to three requests).

The server talks to engines through a small `RoutingProvider` interface, so another engine can be added later without changing the endpoints.

---

## Turning it on

### Add a routing provider

1. In the web app, open **Settings → External Providers → Add**.
2. Choose the type **Valhalla routing** and give it a name.
3. Enter the **Valhalla server URL**. The form suggests the public FOSSGIS server, `https://valhalla1.openstreetmap.de`; change it to your own server or a hosted service if you prefer.
4. Enter an **API key** only if the service needs one (hosted services such as [Stadia Maps](https://stadiamaps.com) do). It is sent as the `api_key` query parameter, stored encrypted like the keys of other providers, never shown to anyone else and never logged.
5. Turn **Activate this provider** on and save.

It works at once: no restart. `GET /api/v2/routes/generate/capabilities` returns `"available": true` and the mobile app shows route generation and **Follow roads** the next time it checks (it re-checks every few minutes, or when you reopen the app).

The provider belongs to you, like any other. Sharing follows the usual rules for external providers: an admin can add one in **Admin → Global Provider Settings** to make it available to everyone on the server, and with the **Share Integrations** family permission your family members can use yours (see [Family & Friends Sharing](../family-friends-sharing.md)). A person's own active provider is used first, then a public or shared one. Generating and snapping routes is still always for the signed-in person only, with the limit of 10 requests per 10 minutes.

::: warning Your route points go to that server
To plan a route, the SparkyFitness **server** sends the start, end and waypoints (and, to find elevation and surface, the resulting line) to the server you choose, which can see them. Use a server you trust, or run your own (below). Your phone never contacts the routing server directly, and saved routes, segments and heatmaps are never sent.
:::

### The public and hosted options

- **FOSSGIS public server** (`https://valhalla1.openstreetmap.de`): a shared server run for the OpenStreetMap community. It is free to try but subject to fair-use limits, so it suits light use. Third-party sources report about one request per second per user, but this is unverified against FOSSGIS's own terms, so check their [terms](https://www.fossgis.de) before relying on it. SparkyFitness identifies itself with a `User-Agent` starting `SparkyFitness/`, as public servers expect.
- **Stadia Maps**: its free plan is for development and **non-commercial use only**; commercial use needs a paid plan. Check their [pricing and limits](https://docs.stadiamaps.com/limits/) for the current quotas.
- **Your own Valhalla**: no limits except your hardware; see [Running Valhalla locally](#running-valhalla-locally).

A loop request costs up to three engine calls per option, which is another reason to keep to your own server for heavy use.

If the provider's URL points at a private or LAN address, the usual rule for self-hosted providers applies: admins may, other users may not unless the operator allows it in **Admin → Global Provider Settings** (or `ALLOW_PRIVATE_NETWORK_FOOD_PROVIDERS=true`).

---

## Several options and route style

**Options.** A loop request can ask for up to three candidates (`alternatives`). The server heads out in different directions, drops any candidate that mostly lies on one it already has, and returns the rest. Each option shows its distance and climb (when the engine has elevation data) and may carry a short label: _Flatter_, _More trail_ or _Shorter_. A label is only given when the numbers back it up: the flattest option has to climb clearly less than the steepest, the trailiest has to have clearly more path than the others, the shortest has to be clearly shorter than the longest. Many options cost more engine calls, so the app asks for three and the per-user limit still applies per request.

**Route style.** You can ask the engine to prefer trails or roads, a flat or a hilly route, to avoid steps and to avoid busy roads. With Valhalla these map onto the costing options of the pedestrian and bicycle profiles (`use_hills`, `use_tracks`, `walkway_factor`, `sidewalk_factor`, `step_penalty`, `use_living_streets` for walking; `use_roads`, `avoid_bad_surfaces`, `use_hills`, `use_living_streets` for riding). Steps never appear on cycling routes, so _avoid steps_ only affects walking, running and hiking. The app only shows the controls the engine reports it supports. These are preferences, not guarantees: the engine still returns the best route it can find.

_More trail_ needs surface data, which the server reads from the engine's `trace_attributes` service. If the engine does not answer that call the option simply gets no _More trail_ label.

---

## Stops along the way

Saved routes can show drinking water, toilets, cafes and viewpoints near the route, with counts and how far along the route each one is. This uses OpenStreetMap data through an [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) endpoint and is **optional and off by default**; with no endpoint configured the section is hidden.

```bash
SPARKY_FITNESS_OVERPASS_URL=https://overpass-api.de/api/interpreter
```

On Kubernetes set `config.overpass.url` in the Helm values.

- Only the server talks to Overpass, never the app. It asks for everything of those four kinds within 150 m of the route in one query.
- Each answer is cached for seven days, keyed by the route's shape, so viewing a route again costs nothing. A failure is remembered for five minutes so a down endpoint isn't hammered.
- Every query has a 15 second timeout, a 2 MB response cap and a limit of 300 results. Routes longer than 120 km are not looked up. The server sends at most 20 queries a minute in total, and each account at most 60 requests per 10 minutes.
- The server identifies itself in the `User-Agent` (package name, version and the project URL), as the [Overpass usage policy](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances) asks.
- Any failure (unreachable, slow, rate limited, unreadable) shows as "no data" rather than an error.

The public instances are shared, so for more than light use run your own Overpass instance and point the variable at it. Stops are not sent to the watch.

---

## Running Valhalla locally

Add a service to your Compose file (or run it alongside) using the community-maintained [gis-ops image](https://github.com/gis-ops/docker-valhalla). It downloads an OpenStreetMap extract on first start and builds its tiles, which can take a few minutes to a few hours depending on the area.

```yaml
services:
  sparkyfitness-valhalla:
    image: ghcr.io/gis-ops/docker-valhalla/valhalla:latest
    restart: unless-stopped
    ports:
      - "8002:8002" # drop this if only SparkyFitness needs to reach it
    volumes:
      - valhalla-data:/custom_files
    environment:
      # Region extract(s) to download and build, space separated.
      tile_urls: https://download.geofabrik.de/europe/great-britain-latest.osm.pbf
      use_tiles_ignore_pbf: "True"
      build_elevation: "True" # optional: adds elevation gain (downloads SRTM tiles)
      server_threads: "2"

volumes:
  valhalla-data:
```

**What map extract it needs.** A single `.osm.pbf` covering everywhere you want routes: [Geofabrik](https://download.geofabrik.de/) publishes country and region extracts, and the smaller the extract the faster the build and the less memory and disk it uses. A start point outside the extract returns "no route". Build time and memory grow with the extract: a small region needs a few GB of RAM, a continent far more. Valhalla's [documentation](https://valhalla.github.io/valhalla/) covers image options and updating the extract.

Don't expose the engine to the internet: SparkyFitness is the only client it needs. Elevation (`build_elevation`) is optional; without it routes have no climb figure.

---

## API

All routes are owner-only, like the rest of saved routes: a delegated or family context is refused.

### `GET /api/v2/routes/generate/capabilities`

Returns what this server offers:

```json
{
  "available": true,
  "maxAlternatives": 3,
  "style": {
    "surface": true,
    "hilliness": true,
    "avoidSteps": true,
    "avoidBusyRoads": true
  },
  "stops": false,
  "source": "provider"
}
```

The answer is for the signed-in person. `source` is `"provider"` when it comes from a routing provider (their own, a public one or a shared one) and `null` when `available` is false. `available` is false when there is no routing provider; then `maxAlternatives` is 1 and every `style` field is false. `stops` is true when `SPARKY_FITNESS_OVERPASS_URL` is set, whether or not a routing engine is. Older servers send only `available`; clients read a missing field as "not supported".

### `POST /api/v2/routes/generate`

Generates a **preview**; nothing is saved. Send either:

- **A loop or out-and-back**: `{ "mode": "loop", "start": { "lat", "lon" }, "activity": "run", "distanceM": 5000, "shape": "loop" | "out_and_back", "bearingDeg"?: 0-360, "alternatives"?: 1-3 }`. Distance is 500 m to 100 km. Without `bearingDeg` the direction is random, so asking again gives a different route. `alternatives` (default 1) asks for up to that many distinct candidates, never more than `maxAlternatives`.
- **Waypoints**: `{ "mode": "waypoints", "start": {...}, "activity": "ride", "waypoints": [{ "lat", "lon" }, ...], "returnToStart"?: boolean }` with 1 to 20 waypoints, routed in order.

`activity` is `run`, `walk`, `ride` or `hike` (default `run`); `name` is optional. Both modes also take `"style"?: { "surface"?: "any" | "trails" | "roads", "hilliness"?: "any" | "flat" | "hilly", "avoidSteps"?: boolean, "avoidBusyRoads"?: boolean }`; anything the engine does not support is ignored.

The response is `{ "route": {...}, "options": [{ "route": {...}, "label": "flatter" | "moreTrail" | "shorter" | null, "trailShare": 0-1 | null }] }`. `route` is the first option, so a client that predates options keeps working; each route is `{ name, activity, source: "generated", points, cues, distanceM, elevationGainM }`, thinned and measured the same way a save does. To keep it, send those fields to `POST /api/v2/routes` (it accepts `source: "generated"`).

| Status | Meaning                                                                       |
| ------ | ----------------------------------------------------------------------------- |
| `400`  | Invalid body                                                                  |
| `422`  | The engine found no route (for example a start point off the map extract)     |
| `429`  | More than 10 generate requests in 10 minutes for this user; see `Retry-After` |
| `502`  | The engine was unreachable, failed, or refused the server's credentials       |
| `503`  | You have no routing provider and the server has no fallback configured        |
| `504`  | The engine took longer than 20 seconds                                        |

### `POST /api/v2/routes/stops` and `GET /api/v2/routes/:id/stops`

Stops near a route that isn't saved (send `{ "points": [{ "lat", "lon" }, ...] }`) or near a saved one. Returns `{ "status": "ok" | "no_data", "stops": [{ "kind": "water" | "toilets" | "cafe" | "viewpoint", "name", "lat", "lon", "distanceFromStartM", "offRouteM" }], "truncated" }`. `503` when no Overpass endpoint is configured, `429` past 60 requests in 10 minutes; every other failure is a `200` with `"no_data"`.

Because one request can cost up to three engine calls per option, the per-user limit is deliberately low. It is counted in memory per server process.
