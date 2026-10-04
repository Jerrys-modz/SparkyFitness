# Exercise Catalogs

Besides your own library, you can search online catalogs from the exercise search screen and add what you find. Catalogs are configured as exercise providers in **Settings > External Providers**; each active provider appears as a tab when you search online.

| Catalog | Needs | Notes |
| :--- | :--- | :--- |
| Wger | Nothing | ~600 exercises, CC-BY-SA 4.0 |
| Free Exercise DB | Nothing | ~870 public-domain exercises with start/end position images |
| ExerciseDB (RapidAPI) | Your own RapidAPI key (free tier available) | ~1,300 exercises with animated demonstrations |
| ExerciseDB (open-source mirror) | Nothing | ~1,500 exercises from a community-hosted AGPL-3.0 mirror |
| Nutritionix | App ID and key | Calorie estimates only; preview, not importable on mobile |

Wger and Free Exercise DB are added for every account. The two ExerciseDB catalogs are opt-in: add them from **Settings > External Providers**.

## ExerciseDB (RapidAPI)

A commercial catalog reached through RapidAPI. Create a RapidAPI account, subscribe to ExerciseDB (the free tier is enough for personal use), and paste your key into the provider. The key is stored encrypted and is only sent to RapidAPI.

RapidAPI rotates its media links weekly. SparkyFitness downloads the demonstration when you add an exercise, so imported exercises keep working without re-importing.

## ExerciseDB (open-source mirror)

A community-hosted AGPL-3.0 mirror of the ExerciseDB dataset. It needs no key. The default endpoint is `https://oss.exercisedb.dev`.

To use a mirror you host yourself, set `EXERCISEDB_OSS_URL` on the server (see [Environment Variables](../../install/environment-variables.md)):

```bash
EXERCISEDB_OSS_URL=https://your-mirror.example.com
```

When the variable is set, the address may be on your private network. Demonstration images are downloaded through the same public-host guard as all other exercise images, so a mirror whose media is served from a private address will import exercises without images.

## Tracking type on import

Imported exercises get their tracking type from the [automatic detection](./bodyweight-exercises.md): a "Farmers Walk" becomes weight & distance, a plank becomes duration, and so on. You can change it afterwards.
