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
INSERT INTO vitals_entries
    (user_id, entry_date, timestamp, systolic_mmhg, diastolic_mmhg, source_provider)
SELECT
    s.user_id,
    s.entry_date,
    s.entry_timestamp,
    s.value,
    d.value,
    CASE
        WHEN lower(regexp_replace(btrim(s.source), '[\s-]+', '_', 'g')) = 'healthconnect'
            THEN 'health_connect'
        ELSE lower(regexp_replace(btrim(s.source), '[\s-]+', '_', 'g'))
    END
FROM custom_measurements s
JOIN custom_categories sc
    ON sc.id = s.category_id AND lower(sc.name) = 'blood_pressure_systolic'
JOIN custom_categories dc
    ON dc.user_id = s.user_id AND lower(dc.name) = 'blood_pressure_diastolic'
JOIN custom_measurements d
    ON d.category_id = dc.id
   AND d.user_id = s.user_id
   AND d.entry_timestamp = s.entry_timestamp
   AND d.source = s.source
WHERE s.value BETWEEN 30 AND 300
  AND d.value BETWEEN 10 AND 200
  AND s.value > d.value
  AND s.entry_timestamp <> (s.entry_date::timestamp AT TIME ZONE 'UTC')
ON CONFLICT (user_id, source_provider, timestamp) DO NOTHING;
