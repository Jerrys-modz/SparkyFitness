// The external provider that backs route generation and "Follow roads": a
// Valhalla routing service. It is a provider like Mealie or Tandoor: an
// `external_data_providers` row of this type (base URL plus an optional API
// key) that is active and visible to the user makes
// `GET /api/v2/routes/generate/capabilities` report `available`.
export const ROUTING_PROVIDER_TYPE = 'valhalla';

// Suggested when someone adds the provider. The FOSSGIS-run public server is
// free to try but shared, so the add-provider form says it is for light use
// and that route points are sent to whichever server is chosen.
export const ROUTING_PROVIDER_DEFAULT_BASE_URL =
  'https://valhalla1.openstreetmap.de';

// The external provider that backs stops along a route (drinking water,
// toilets, cafes, viewpoints): an Overpass API endpoint serving OpenStreetMap
// data. It resolves like the routing provider: the person's own, an admin's
// public one, or a family member's shared one.
export const STOPS_PROVIDER_TYPE = 'overpass';
