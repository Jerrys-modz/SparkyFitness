-- Migration: Add the ExerciseDB community mirror exercise catalog provider type
-- A community-hosted mirror of the ExerciseDB catalog; no key required. Its
-- terms allow personal, non-commercial and community use and ask for credit to
-- AscendAPI. Not added to create_default_external_data_providers: the user
-- opts in from Settings.

INSERT INTO public.external_provider_types (id, display_name, description, categories, required_fields, field_labels)
VALUES (
  'exercisedb-oss',
  'ExerciseDB (community mirror)',
  'Community-hosted mirror of the ExerciseDB catalog. No key required. Non-commercial use; data and demonstrations © AscendAPI / ExerciseDB.',
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
