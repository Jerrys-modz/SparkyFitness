# Garmin Connect

SparkyFitness reads your activities, workouts and health data from Garmin Connect through a small companion service (`SparkyFitnessGarmin`). Connect it in **Settings → External Providers → Garmin Connect** with your Garmin email and password (and an MFA code if your account uses one). SparkyFitness stores the resulting login tokens, encrypted, not your password.

---

## Sending a saved route to your watch

A route in your saved-routes library can be sent to Garmin Connect as a **course**. Garmin Connect then syncs it to your watch with your other courses.

- Endpoint: `POST /api/v2/routes/:id/send-to-garmin` (owner only; it is refused in a switched or delegated context). There is no button for it in the apps yet.
- Needs Garmin to be linked first. Without it the call answers `409`.
- SparkyFitness first sends a **FIT course file** with the route's turn cues as course points (left, right, slight and sharp turns, straight, U-turn, arrive), so a watch can show turn alerts.
- If Garmin rejects the FIT file, it retries with a **GPX track**. The watch then follows the line but has **no turn alerts**. The response says which one was used (`format: "fit"` or `"gpx"`).

| Status | Meaning                                                       |
| ------ | ------------------------------------------------------------- |
| `404`  | The route does not exist or is not yours.                     |
| `409`  | No Garmin account is linked.                                  |
| `424`  | Garmin refused the saved login; reconnect Garmin in Settings. |
| `429`  | Garmin is rate limiting requests; try again later.            |
| `502`  | Garmin rejected the course.                                   |
| `503`  | The Garmin service cannot be reached.                         |

::: warning Unofficial API
Garmin has no public API for courses. SparkyFitness uses the same course importer the Garmin Connect website uses, through the unofficial `garminconnect` library's login session. Garmin can change or block it at any time, so sending a route may stop working after a Garmin update until SparkyFitness is updated. A `502` is the usual sign. You can always export the route as GPX and import it on the Garmin Connect website (Training & Planning → Courses → Import).
:::

Only courses are sent. Structured workouts (intervals) are not pushed to Garmin.
