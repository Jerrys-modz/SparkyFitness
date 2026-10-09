-- Migration: Add the ExerciseDB (AscendAPI) exercise provider type
-- File: SparkyFitnessServer/db/migrations/20261009120000_add_exercisedb_provider_type.sql
--
-- Free hosted ExerciseDB V1 API (https://oss.exercisedb.dev). It needs no key and
-- serves 180p GIFs, but its terms limit it to non-commercial use, require credit
-- to AscendAPI and apply strict rate limits. It is therefore NOT added to the
-- providers every instance gets by default: a user (or admin) adds it explicitly
-- from Settings > External Providers.

BEGIN;

INSERT INTO public.external_provider_types (id, display_name, description)
VALUES (
  'exercisedb',
  'ExerciseDB (AscendAPI)',
  'Exercise catalogue with animated GIF demonstrations from the free hosted ExerciseDB API. Free for non-commercial use; credit to AscendAPI is required.'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

UPDATE public.external_provider_types
SET categories = ARRAY['exercise'],
    required_fields = ARRAY[]::VARCHAR[],
    is_strictly_private = FALSE,
    supports_barcode = FALSE
WHERE id = 'exercisedb';

COMMIT;
