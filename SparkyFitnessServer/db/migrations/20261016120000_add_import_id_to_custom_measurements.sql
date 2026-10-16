-- A lab report import tags every result it saves with one import_id, so the
-- results that came from a report can be found, and deleted, apart from the
-- ones typed by hand. NULL for everything else.
ALTER TABLE public.custom_measurements
  ADD COLUMN IF NOT EXISTS import_id uuid;

COMMENT ON COLUMN public.custom_measurements.import_id IS 'Identifies the lab report import that saved this result. NULL for results that were not imported.';
