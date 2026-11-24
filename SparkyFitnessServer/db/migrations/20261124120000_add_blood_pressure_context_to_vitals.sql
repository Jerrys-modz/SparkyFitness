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
