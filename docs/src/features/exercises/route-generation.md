# Route Generation

SparkyFitness can generate a run, walk, ride or hike route for you: a loop or out-and-back of a distance you choose, or a route through points you pick. The result is a preview with turn-by-turn cues; saving it adds it to your saved routes.

Route generation is **optional and off until a routing provider is added**. Route options, route style and stops along a route are part of the same feature: options and style come with the Valhalla provider, and stops need a second provider (Overpass, below). SparkyFitness doesn't ship a routing engine and the server needs no extra container or environment variable: you add a Valhalla routing service as an external provider, the same way you add Mealie or Hevy. Until one is added, the app reports the feature as unavailable.

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
To plan a route, the SparkyFitness **server** sends the start, end and waypoints (and, to find elevation, the resulting line) to the server you choose, which can see them. Use a server you trust, or run your own (below). Your phone never contacts the routing server directly, and your saved routes are never sent.
:::

### The public and hosted options

- **FOSSGIS public server** (`https://valhalla1.openstreetmap.de`): a shared server run for the OpenStreetMap community. It is free to try but subject to fair-use limits, so it suits light use. The limits are not documented here: figures such as about one request per second per user are secondhand reports that we have not verified against FOSSGIS's own terms, so check with FOSSGIS before relying on them. SparkyFitness identifies itself with a `User-Agent` starting `SparkyFitness/`, as public servers expect.
- **Stadia Maps**: its free plan is for development and **non-commercial use only**; commercial use needs a paid plan. Check their [pricing and limits](https://docs.stadiamaps.com/limits/) for the current quotas.
- **Your own Valhalla**: no limits except your hardware; see [Running Valhalla locally](#running-valhalla-locally).

A loop request costs up to three engine calls, and asking for alternatives (below) costs up to three times that, which is another reason to keep to your own server for heavy use.

If the provider's URL points at a private or LAN address, the usual rule for self-hosted providers applies: admins may, other users may not unless the operator allows it in **Admin → Global Provider Settings** (or `ALLOW_PRIVATE_NETWORK_FOOD_PROVIDERS=true`).

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
  "stops": true,
  "source": "provider",
  "stopsSource": "provider"
}
```

The answer is for the signed-in person. `source` is `"provider"` when the routing engine comes from a routing provider (their own, a public one or a shared one) and `null` when `available` is false, which means there is no routing provider. With the Valhalla provider `maxAlternatives` is 3 and every `style` field is true; with no routing provider they read 1 and false. `stops` and `stopsSource` follow the **Overpass** provider independently of the routing one, and read `false` and `null` while the Overpass server has asked the SparkyFitness server to slow down (see below), so a client simply stops offering stops for a moment. Older servers send only `available`; clients read a missing field as "not supported".

### `POST /api/v2/routes/generate`

Generates a **preview**; nothing is saved. Send either:

- **A loop or out-and-back**: `{ "mode": "loop", "start": { "lat", "lon" }, "activity": "run", "distanceM": 5000, "shape": "loop" | "out_and_back", "bearingDeg"?: 0-360 }`. Distance is 500 m to 100 km. Without `bearingDeg` the direction is random, so asking again gives a different route.
- **Waypoints**: `{ "mode": "waypoints", "start": {...}, "activity": "ride", "waypoints": [{ "lat", "lon" }, ...], "returnToStart"?: boolean }` with 1 to 20 waypoints, routed in order.

`activity` is `run`, `walk`, `ride` or `hike` (default `run`); `name` is optional. Both modes take an optional `style` (below), and a loop also takes `alternatives` (1 to 3, default 1).

The response is `{ "route": {...}, "options": [{ "route": {...}, "label": "flatter" | "moreTrail" | "shorter" | null, "trailShare": 0-1 | null }] }`. A route is `{ name, activity, source: "generated", points, cues, distanceM, elevationGainM }`, thinned and measured the same way a save does. `route` is always the first option, so a client that ignores `options` still works. To keep one, send its fields to `POST /api/v2/routes` (it accepts `source: "generated"`).

| Status | Meaning                                                                       |
| ------ | ----------------------------------------------------------------------------- |
| `400`  | Invalid body                                                                  |
| `422`  | The engine found no route (for example a start point off the map extract)     |
| `429`  | More than 10 generate requests in 10 minutes for this user; see `Retry-After` |
| `502`  | The engine was unreachable, failed, or refused the server's credentials       |
| `503`  | You have no routing provider (add one in Settings → External Providers)       |
| `504`  | The engine took longer than 20 seconds                                        |

The per-user limit is deliberately low because one request can cost several engine calls. It is counted in memory per server process.

---

## Route options

A loop request with `alternatives` above 1 returns up to that many **distinct** loops (never more than the provider's `maxAlternatives`). The server heads out in different directions, compares the results by measured overlap along their length and drops one that mostly repeats an earlier one, then tries another heading to make up the number. If some headings fail but at least one works, you get what worked.

Each option is labelled **Flatter**, **More trail** or **Shorter** only when its numbers back it up: Flatter needs the flattest option to climb at least 20% and 15 m less than the steepest; More trail needs at least 20% of its length on paths or unpaved ways and 15 percentage points more than any other; Shorter needs to be at least 5% and 200 m shorter than the longest. A label goes to one option, and an option gets one label. The share on paths comes from the routing engine's own surface data when it can be read; without it there is simply no More trail label.

Asking for three options costs up to three times as many engine calls (the headings run in parallel).

## Route style

`style` is `{ surface: "any" | "trails" | "roads", hilliness: "any" | "flat" | "hilly", avoidSteps: boolean, avoidBusyRoads: boolean }`. The server keeps only what the provider supports (all of them, for Valhalla) and sends the rest as Valhalla `costing_options`; preferences change which route the engine picks, they don't guarantee one. Steps are never on a cycling route, so `avoidSteps` does nothing for a ride. A request without a style is sent to the engine exactly as before.

---

## Stops along a route

Drinking water, toilets, cafes and viewpoints within 150 m of a saved route, from [OpenStreetMap](https://www.openstreetmap.org/) data, shown in the route's detail screen as a list and, on a real map, as coloured dots. Private or closed facilities and drinking water marked as not drinkable are left out. Map data is from OpenStreetMap contributors.

### Add an Overpass provider

Stops are off until you add an Overpass server, the same way as the routing provider:

1. In the web app, open **Settings → External Providers → Add**.
2. Choose the type **Overpass (route stops)** and give it a name.
3. Enter the **Overpass API URL**. **Nothing is filled in for you**: use a server you run or are allowed to use. An Overpass API URL usually ends in `/api/interpreter`.
4. Turn **Activate this provider** on and save.

It works at once, with no restart and no environment variable. Sharing follows the usual external provider rules (own provider first, then an admin's public one, then a family member's shared one), and a private or LAN address follows the same rule as the routing provider.

::: warning The area around your route goes to that server
To look up stops, the SparkyFitness **server** sends a corridor query built from your route's line (a thinned version of its points) to the Overpass server you choose, which can see it. Use a server you trust.
:::

### The public Overpass instance is for light use only

The public instance (`overpass-api.de`) is a shared, volunteer-run service. Its documentation asks users to stay under about **10,000 requests and 1 GB of downloads a day**, and every user of a SparkyFitness server (or of anything else using the same server) counts toward that. We read those figures on the Overpass documentation's usage page (<https://dev.overpass-api.de/overpass-doc/en/preface/commons.html>). The OpenStreetMap wiki is also said to ask apps to use a fraction of those numbers, to identify themselves, to avoid parallel requests and to pause after a 429 or 406 answer; we could not re-check that wiki text, so treat it as secondhand. For more than a person or two, or any regular use, **host your own Overpass instance** or use a private or paid one, and put its URL here.

SparkyFitness is deliberately gentle either way:

- Each request carries a `User-Agent` starting `SparkyFitness/`.
- One query per route, cached on the server for 7 days (a failure for 5 minutes). Lookups to one Overpass server run **one at a time**, with at most five waiting; more read as busy.
- After a **429** or **406** answer nothing more is sent to that server for **30 seconds**. During that time stops report `busy` and the capabilities answer says `stops: false`, so the app just stops offering stops for a moment.
- At most 20 queries a minute per Overpass server, whoever asks. Routes over 120 km are not looked up.
- A query asks for at most 300 elements, with a 12 second server-side timeout, a 15 second client timeout and a 2 MB response cap. At most 1,000 elements of an answer are read, at most 150 stops returned, and a name is cut to 80 characters.

The cache is in the server's memory, so it is empty after a restart. No database table is involved.

### Stops API

Both endpoints are owner-only, limited to 60 requests per user per 10 minutes, and answer `503` when the person has no Overpass provider.

- `GET /api/v2/routes/{id}/stops` for a route the person saved (`404` for any other).
- `POST /api/v2/routes/stops` with `{ "points": [{ "lat", "lon" }, ...] }` (2 to 2,000 points) for a route that isn't saved.

The answer is `{ "status": "ok" | "no_data" | "busy", "stops": [{ kind, name, lat, lon, distanceFromStartM, offRouteM }], "truncated": boolean }`, with `kind` one of `water`, `toilets`, `cafe`, `viewpoint`, in route order. Every failure (unreachable, timeout, unreadable answer) is a `200` with `no_data`, never an error; `busy` means the Overpass server's budget is used up or it asked us to slow down.

### Running Overpass yourself

The [Overpass API installation guide](https://wiki.openstreetmap.org/wiki/Overpass_API/Installation) covers self-hosting; a regional extract is much smaller than the planet. Add it in Settings with its `/api/interpreter` URL.
