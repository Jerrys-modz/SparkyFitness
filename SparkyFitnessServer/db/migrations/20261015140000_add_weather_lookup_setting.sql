-- Admin switch for looking up the weather of GPS-recorded activities.
--
-- Off by default: turning it on makes the server send an activity's start time
-- and its start place (rounded to about 1 km) to Open-Meteo. It is an admin
-- decision made in the UI, with no environment-variable equivalent.

ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS weather_lookup_enabled BOOLEAN NOT NULL DEFAULT FALSE;
