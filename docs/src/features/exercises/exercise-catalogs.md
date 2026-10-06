# Exercise Catalogs

Besides your own library, you can search online catalogs from the exercise search screen and add what you find. Catalogs are configured as exercise providers in **Settings > External Providers**; each active provider appears as a tab when you search online.

| Catalog | Needs | Notes |
| :--- | :--- | :--- |
| Wger | Nothing | ~600 exercises, CC-BY-SA 4.0 |
| Free Exercise DB | Nothing | ~870 public-domain exercises with start/end position images |
| ExerciseDB (community mirror) | Nothing | 1,500 exercises with 180p GIF demonstrations; non-commercial use, credit to AscendAPI |
| Nutritionix | App ID and key | Calorie estimates only; preview, not importable on mobile |

Wger and Free Exercise DB are added for every account. The ExerciseDB mirror is opt-in: add it from **Settings > External Providers**.

## ExerciseDB (community mirror)

A community-hosted mirror of the ExerciseDB catalog at `https://oss.exercisedb.dev`. It needs no key. Many of its exercises are equipment variants of movements the other catalogs already have ("cable lying fly", "barbell incline row"), so it mostly adds breadth.

The mirror serves 25 exercises per request and its project warns of strict rate limits, so browsing a long list can be slow. Searching it sends your search terms and your server's IP address to its operator.

## Licensing and credit

The mirror's usage terms allow personal projects, prototypes, educational tools, non-commercial apps and community-driven fitness platforms. They do **not** allow commercial products, SaaS platforms or any monetised use without a paid plan through RapidAPI, and they require credit to AscendAPI. SparkyFitness shows "Data and demonstrations © AscendAPI / ExerciseDB" on imported ExerciseDB exercises. If you run SparkyFitness commercially, do not enable this provider without a paid ExerciseDB plan.

The ExerciseDB API server code is AGPL-3.0, but that does not make the exercise data or media openly licensed. SparkyFitness does not ship any of it and adds no licence over it.

SparkyFitness never downloads ExerciseDB's graphics. An imported exercise keeps the provider's media link and your app loads the picture from there, so it can stop loading if the provider changes the link. Only the exercise's text (name, muscles, equipment, instructions) is saved in your library.

Do not share imported ExerciseDB exercises publicly or with others unless the terms you operate under allow it.

## Tracking type on import

Imported exercises get their tracking type from the [automatic detection](./bodyweight-exercises.md): a "Farmers Walk" becomes weight & distance, a plank becomes duration, and so on. You can change it afterwards.
