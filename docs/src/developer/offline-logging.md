# Offline Logging (Mobile)

How the mobile app keeps a food entry, a drink or a weight when the server cannot be reached, and replays it later without double-logging. This page is the design for the first slice and is kept next to the code that implements it.

## What exists today

- Every write is a direct `apiFetch` call (`SparkyFitnessMobile/src/services/api/apiClient.ts`) from a mutation hook. A failed call shows a toast and the entry is gone.
- React Query has `staleTime: Infinity` and no persistence: a cold start without the server shows nothing.
- `services/watchRunQueue.ts` is the precedent for a durable queue (one AsyncStorage key, serialised read-modify-write, "retryable unless 4xx other than 401/408/429"). The health-sync paths use cursors rather than queues.
- A 401 on a session login calls `notifySessionExpired`, which opens `ReauthModal`. Re-authenticating always runs `notifyIdentityChanged`, because the app cannot tell whether the same account signed back in.
- Idempotency on the server is uneven:
  - `exercise_entries.id` accepts a client uuid.
  - `food_entries` upserts on `(user_id, source, source_id)`, but that pair means "written by a provider" and Health Connect writeback skips such rows, so it cannot be reused for hand-logged food.
  - `POST /measurements/water-intake` takes a **delta** (`change_drinks`), so a replay after a timeout double-counts.
  - `POST /measurements/check-in` is an upsert by day, so a replay is harmless.

## First slice: what is queueable

| Write | Queueable | Why |
| --- | --- | --- |
| Food diary entry for a food already in the library (search result, recent, favourite, custom food that is saved) | Yes | The request carries ids and a quantity; the server derives the snapshot. |
| Water: a `+1` press on a container, and drink quick-add presets | Yes | One press is one request with a client id. |
| Weight and other check-in measurements | Yes | Idempotent upsert by day. |
| Edit or delete of a server entry | No | Needs the current server state. Shows "needs a connection". |
| Water `-1` | No | Removes whatever the server has. Needs a connection. |
| AI photo estimate, barcode lookup of an uncached food, provider (external) search, creating a new food, meals, copy | No | Need server computation first. They show a clear "needs a connection" state. |

A queued write never changes what the user typed: the queue stores the request the app would have sent.

## Storage

AsyncStorage, one key (`@SparkyFitness/offlineQueue`), as `watchRunQueue` does. SQLite would add a native dependency and a migration story for a list that is small by construction: items are about 1 KB and the queue is capped at 200 pending entries (a full queue refuses new writes with a message rather than dropping old ones). Writes are serialised through one promise chain so two enqueues cannot lose each other.

Corruption: the value is parsed and each item is shape-checked. Unparseable data is copied to `@SparkyFitness/offlineQueue.corrupt` and logged, never silently discarded; a malformed single item is moved to the needs-attention list.

## Entry shape

```ts
interface QueueItem {
  id: string;            // uuid, also the idempotency key (client_id)
  kind: 'food_entry' | 'water' | 'check_in';
  configId: string;      // server config the write was made against
  accountId: string | null; // profile id, resolved lazily
  payload: ...;          // the request body, per kind
  preview: ...;          // what the screens show while it waits (see "Reads")
  entryDate: string;     // YYYY-MM-DD in the user's day, never a UTC slice
  createdAt: string;     // ISO instant, ordering tiebreak
  attempts: number;
  nextAttemptAt: number; // ms epoch
  lastError?: string;
}
```

The id is minted **before the first network attempt** and sent with it, so a request that timed out but committed is deduplicated when the queue replays it.

## Ordering, retry and failure

- First in, first out. A drain pass stops at the first retryable failure so later writes never overtake earlier ones for the same day.
- Retryable: network failure, timeout (`TimeoutError`), 5xx, 401, 408, 429. Backoff is `min(30 s * 2^(attempts-1), 15 min)`. A network failure or reconnect retries immediately; "Sync now" ignores backoff.
- Permanent: any other 4xx. The item leaves the queue and goes to the **needs attention** list with the server message and its payload summary. It is never dropped silently; the user can discard it.
- 401: the pass stops and the queue is kept. `ReauthModal` already opens; the queue drains again after `notifyIdentityChanged`.
- "Try the network first": a write only goes straight to the queue when the device reports no connection. Otherwise it is sent, and queued only if that attempt fails with a network error, a timeout or a 401. Other errors behave exactly as before (toast, nothing queued).

## Accounts

Each item carries `configId` and `accountId`. Only items for the active config are drained or shown. After an identity change the drain resolves the signed-in profile id first: items stamped with a different account are not sent; they appear in needs attention as "belongs to a different account". Items with no stamp adopt the current account.

## Conflicts

One rule: **a queued entry can be deleted but not edited.** Deleting removes it from the queue (it never reached the server). To change it, delete it and log it again. Once synced it is a normal entry. A queued write is applied after any server change, so a weight queued offline overwrites a weight typed on the web in the meantime (last write wins, the same as two devices today).

## Server idempotency

Optional `client_id` (uuid) on `POST /api/food-entries` and `POST /api/measurements/water-intake`:

- Migration adds `food_entries.client_id` and `water_intake_entries.client_id`, each with a partial unique index on `(user_id, client_id) WHERE client_id IS NOT NULL`. No new table, so RLS policies are unchanged.
- A request whose `client_id` already exists returns the existing row (food: `200` with the entry; water: the current day totals) and writes nothing. A concurrent duplicate that loses the race hits the unique index and is resolved to the same answer.
- `client_id` on water requires `change_drinks` of exactly `1`. For a container linked to a food, the food entry carries the same id, so a duplicate stops before creating a second one.
- Check-in needs no key.

## Reads while offline

A bounded cache is persisted (custom persister over `dehydrate`/`hydrate`, no new dependency): the latest few `dailySummary` days, `measurements`, meal types, water containers, preferences, goals and the recent/favourite food lists, each capped. It is stored per server config, cleared on identity change and when the server config is deleted, and is restored once at startup. The data is not encrypted at rest (the same as drafts and the queue itself). Anything not in the cache simply is not shown offline; a text search or a barcode scan states that it needs a connection.

Queued entries are **overlaid at read time**, not written into the cache: `useDailySummary` merges pending food entries and water into the cached raw data, and `useMeasurements` merges a pending weight. The totals, rings and macros therefore include what is waiting, and a refetch can never erase them. When an item syncs it stays in the overlay until the refetch settles, so the diary does not blink.

## UI

- A slim banner ("Offline, 3 waiting to sync" / "3 waiting to sync" / "Syncing...") shows only when there is something to say. Tapping it opens the queue screen.
- A "Waiting to sync" badge on diary rows for queued food entries; swipe-delete cancels the entry.
- Queue screen: the waiting list, **Sync now**, and **Needs attention** with discard.
- Drain triggers: app foreground, connectivity regained, a successful re-auth, a new enqueue while online, and Sync now. One drain runs at a time. When the queue drains the usual cache family is invalidated (daily summary, caffeine, water log, foods, measurements).

Connectivity uses `expo-network`, already a dependency of the app, so no rebuild is needed.

## Not in this slice

Editing or deleting server entries offline, `-1` water, offline meals, custom-food creation, barcode, photo and provider flows, exercise and workout logging, fasting, medications, mood and every other domain; background (headless) replay while the app is closed; encryption of the persisted cache; merging conflicting edits; a server-side "last modified" check for queued check-ins.
