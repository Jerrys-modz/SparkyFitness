-- Blood pressure tracking: vitals_entries becomes the single home for readings.
-- Adds the optional context a reading can carry (the same values Health Connect's
-- BloodPressureRecord uses, so synced readings keep them) and range checks for
-- new rows. Existing rows are untouched.

ALTER TABLE vitals_entries
    ADD COLUMN IF NOT EXISTS arm TEXT,
    ADD COLUMN IF NOT EXISTS body_position TEXT,
    ADD COLUMN IF NOT EXISTS note TEXT;

ALTER TABLE vitals_entries DROP CONSTRAINT IF EXISTS chk_vitals_arm;
ALTER TABLE vitals_entries
    ADD CONSTRAINT chk_vitals_arm
    CHECK (arm IS NULL OR arm IN ('left', 'right')) NOT VALID;

ALTER TABLE vitals_entries DROP CONSTRAINT IF EXISTS chk_vitals_body_position;
ALTER TABLE vitals_entries
    ADD CONSTRAINT chk_vitals_body_position
    CHECK (body_position IS NULL OR body_position IN ('sitting', 'standing', 'lying', 'reclining')) NOT VALID;

-- Plausible ranges for new rows only (NOT VALID leaves any existing synced rows alone).
ALTER TABLE vitals_entries DROP CONSTRAINT IF EXISTS chk_vitals_bp_range;
ALTER TABLE vitals_entries
    ADD CONSTRAINT chk_vitals_bp_range
    CHECK (
        (systolic_mmhg IS NULL OR systolic_mmhg BETWEEN 30 AND 300)
        AND (diastolic_mmhg IS NULL OR diastolic_mmhg BETWEEN 10 AND 200)
    ) NOT VALID;

-- Readings synced from Health Connect and Apple Health before blood pressure
-- had its own home were stored as two custom measurements (systolic and
-- diastolic categories). Copy each pair that shares an exact instant and
-- source into vitals_entries. The custom measurements are left in place. A
-- row stamped at the start of its day (an app that sent only the day) is
-- skipped, since its time of day is not known. Re-running adds nothing.
WITH readings AS (
    -- custom_measurements.value is text, so read it as a number only where it is one.
    SELECT
        m.user_id,
        m.entry_date,
        m.entry_timestamp,
        m.source,
        lower(c.name) AS category,
        CASE WHEN m.value ~ '^[0-9]+(\.[0-9]+)?$' THEN m.value::numeric END AS reading
    FROM custom_measurements m
    JOIN custom_categories c ON c.id = m.category_id
    WHERE lower(c.name) IN ('blood_pressure_systolic', 'blood_pressure_diastolic')
)
INSERT INTO vitals_entries
    (user_id, entry_date, timestamp, systolic_mmhg, diastolic_mmhg, source_provider)
SELECT
    s.user_id,
    s.entry_date,
    s.entry_timestamp,
    s.reading,
    d.reading,
    -- A row with no source of its own (older apps) was stored as 'manual'; it is
    -- device data, so it is not filed as a reading the person logged by hand.
    CASE
        WHEN lower(regexp_replace(btrim(s.source), '[\s-]+', '_', 'g')) IN ('healthconnect', 'manual', '')
            THEN 'health_connect'
        ELSE lower(regexp_replace(btrim(s.source), '[\s-]+', '_', 'g'))
    END
FROM readings s
JOIN readings d
    ON d.user_id = s.user_id
   AND d.entry_timestamp = s.entry_timestamp
   AND d.source = s.source
   AND d.category = 'blood_pressure_diastolic'
WHERE s.category = 'blood_pressure_systolic'
  AND s.reading BETWEEN 30 AND 300
  AND d.reading BETWEEN 10 AND 200
  AND s.reading > d.reading
  AND s.entry_timestamp <> (s.entry_date::timestamp AT TIME ZONE 'UTC')
ON CONFLICT (user_id, source_provider, timestamp) DO NOTHING;
