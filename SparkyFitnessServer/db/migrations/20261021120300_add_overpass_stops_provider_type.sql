-- SparkyFitnessServer/db/migrations/20261021120300_add_overpass_stops_provider_type.sql
-- Add the Overpass provider type. Stops along a route (drinking water, toilets,
-- cafes, viewpoints) are looked up from OpenStreetMap through the Overpass API
-- endpoint a person (or the admin, as a global provider) adds in Settings >
-- External Providers. Only a base URL is needed; no key.
--
-- No new table or column, so no RLS change: external_data_providers keeps its
-- owner / public / family-share policies. Not strictly private, so an admin can
-- offer one endpoint to everyone (is_public) and a person can share theirs
-- through share_external_providers, like the Valhalla routing provider.

INSERT INTO public.external_provider_types (id, display_name, description)
VALUES (
  'overpass',
  'Overpass (route stops)',
  'OpenStreetMap data service used to show drinking water, toilets, cafes and viewpoints along a route. The area around the route is sent to the server you choose.'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

UPDATE public.external_provider_types
SET categories = ARRAY['other'],
    required_fields = ARRAY['base_url'],
    field_labels = '{"base_url": "Overpass API URL"}'::jsonb,
    is_strictly_private = FALSE,
    supports_barcode = FALSE
WHERE id = 'overpass';
