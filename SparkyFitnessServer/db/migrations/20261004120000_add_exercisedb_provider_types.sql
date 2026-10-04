-- Migration: Add ExerciseDB exercise catalog provider types
-- ExerciseDB via RapidAPI (user supplies their own key) and the open-source
-- mirror (no key; endpoint set server-side with EXERCISEDB_OSS_URL).
-- Neither is added to create_default_external_data_providers: the user opts in
-- from Settings, because one needs a key and the other is a third-party host.

INSERT INTO public.external_provider_types (id, display_name, description, categories, required_fields, field_labels)
VALUES
  (
    'exercisedb',
    'ExerciseDB (RapidAPI)',
    'Commercial ExerciseDB catalog with animated demonstrations, reached through RapidAPI with your own key.',
    ARRAY['exercise'],
    ARRAY['app_key'],
    '{"app_key": "RapidAPI key"}'::jsonb
  ),
  (
    'exercisedb-oss',
    'ExerciseDB (open-source mirror)',
    'Community-hosted AGPL-3.0 mirror of the ExerciseDB dataset. No key required.',
    ARRAY['exercise'],
    ARRAY[]::VARCHAR[],
    NULL
  )
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  categories = EXCLUDED.categories,
  required_fields = EXCLUDED.required_fields,
  field_labels = EXCLUDED.field_labels;
