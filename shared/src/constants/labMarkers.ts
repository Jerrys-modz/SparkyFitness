// Presets for lab-result markers. Picking one creates a custom category with
// `is_lab` set, the unit prefilled into `measurement_type`, and the reference
// range prefilled. Ranges are common adult defaults only; labs differ, and some
// markers vary by sex or age (hemoglobin, testosterone, ...), so the user can
// edit them. Markers with no sensible single default have no range. `aliases`
// are the other names a lab report may print, used to match scanned results to
// a marker.
export interface LabMarkerPreset {
  /** Stable key, also used as the category `name`. */
  key: string;
  displayName: string;
  unit: string;
  refRangeLow: number | null;
  refRangeHigh: number | null;
  aliases: readonly string[];
}

export const LAB_MARKER_PRESETS: readonly LabMarkerPreset[] = [
  {
    key: "hba1c",
    displayName: "HbA1c",
    unit: "%",
    refRangeLow: 4,
    refRangeHigh: 5.6,
    aliases: [
      "hemoglobin a1c",
      "glycated hemoglobin",
      "glycohemoglobin",
      "a1c",
    ],
  },
  {
    key: "fasting_glucose",
    displayName: "Fasting Glucose",
    unit: "mg/dL",
    refRangeLow: 70,
    refRangeHigh: 99,
    aliases: ["glucose", "glucose, fasting", "fasting blood sugar", "fbs"],
  },
  {
    key: "total_cholesterol",
    displayName: "Total Cholesterol",
    unit: "mg/dL",
    refRangeLow: null,
    refRangeHigh: 200,
    aliases: ["cholesterol", "cholesterol, total"],
  },
  {
    key: "hdl",
    displayName: "HDL Cholesterol",
    unit: "mg/dL",
    refRangeLow: 40,
    refRangeHigh: null,
    aliases: ["hdl", "hdl-c", "hdl cholesterol"],
  },
  {
    key: "ldl",
    displayName: "LDL Cholesterol",
    unit: "mg/dL",
    refRangeLow: null,
    refRangeHigh: 100,
    aliases: ["ldl", "ldl-c", "ldl cholesterol", "ldl cholesterol calc"],
  },
  {
    key: "triglycerides",
    displayName: "Triglycerides",
    unit: "mg/dL",
    refRangeLow: null,
    refRangeHigh: 150,
    aliases: ["trigs", "tg"],
  },
  {
    key: "vitamin_d",
    displayName: "Vitamin D (25-OH)",
    unit: "ng/mL",
    refRangeLow: 30,
    refRangeHigh: 100,
    aliases: ["vitamin d", "25-hydroxyvitamin d", "25-oh vitamin d", "vit d"],
  },
  {
    key: "tsh",
    displayName: "TSH",
    unit: "mIU/L",
    refRangeLow: 0.4,
    refRangeHigh: 4.0,
    aliases: ["thyroid stimulating hormone", "thyrotropin"],
  },
  {
    key: "ferritin",
    displayName: "Ferritin",
    unit: "ng/mL",
    refRangeLow: 30,
    refRangeHigh: 400,
    aliases: [],
  },
  {
    key: "vitamin_b12",
    displayName: "Vitamin B12",
    unit: "pg/mL",
    refRangeLow: 200,
    refRangeHigh: 900,
    aliases: ["b12", "cobalamin"],
  },
  {
    key: "creatinine",
    displayName: "Creatinine",
    unit: "mg/dL",
    refRangeLow: 0.6,
    refRangeHigh: 1.3,
    aliases: [],
  },
  {
    key: "egfr",
    displayName: "eGFR",
    unit: "mL/min/1.73m²",
    refRangeLow: 60,
    refRangeHigh: null,
    aliases: ["estimated gfr", "gfr"],
  },
  {
    key: "alt",
    displayName: "ALT",
    unit: "U/L",
    refRangeLow: 7,
    refRangeHigh: 56,
    aliases: ["alanine aminotransferase", "sgpt"],
  },
  {
    key: "ast",
    displayName: "AST",
    unit: "U/L",
    refRangeLow: 10,
    refRangeHigh: 40,
    aliases: ["aspartate aminotransferase", "sgot"],
  },
  {
    key: "non_hdl",
    displayName: "Non-HDL Cholesterol",
    unit: "mg/dL",
    refRangeLow: null,
    refRangeHigh: 130,
    aliases: ["non-hdl", "non hdl", "non-hdl cholesterol"],
  },
  {
    key: "apob",
    displayName: "Apolipoprotein B",
    unit: "mg/dL",
    refRangeLow: null,
    refRangeHigh: 90,
    aliases: ["apo b", "apob", "apolipoprotein b"],
  },
  {
    key: "vldl",
    displayName: "VLDL Cholesterol",
    unit: "mg/dL",
    refRangeLow: 5,
    refRangeHigh: 40,
    aliases: ["vldl", "vldl cholesterol", "vldl cholesterol cal"],
  },
  {
    key: "fasting_insulin",
    displayName: "Fasting Insulin",
    unit: "µIU/mL",
    refRangeLow: 2,
    refRangeHigh: 25,
    aliases: ["insulin", "insulin, fasting"],
  },
  {
    key: "wbc",
    displayName: "White Blood Cells",
    unit: "10³/µL",
    refRangeLow: 4.0,
    refRangeHigh: 11.0,
    aliases: ["wbc", "white blood cell count", "leukocytes"],
  },
  {
    key: "rbc",
    displayName: "Red Blood Cells",
    unit: "10⁶/µL",
    refRangeLow: 4.2,
    refRangeHigh: 5.9,
    aliases: ["rbc", "red blood cell count", "erythrocytes"],
  },
  {
    key: "hemoglobin",
    displayName: "Hemoglobin",
    unit: "g/dL",
    refRangeLow: 12.0,
    refRangeHigh: 17.5,
    aliases: ["hgb", "hb"],
  },
  {
    key: "hematocrit",
    displayName: "Hematocrit",
    unit: "%",
    refRangeLow: 36,
    refRangeHigh: 52,
    aliases: ["hct"],
  },
  {
    key: "mcv",
    displayName: "MCV",
    unit: "fL",
    refRangeLow: 80,
    refRangeHigh: 100,
    aliases: ["mean corpuscular volume"],
  },
  {
    key: "platelets",
    displayName: "Platelets",
    unit: "10³/µL",
    refRangeLow: 150,
    refRangeHigh: 450,
    aliases: ["plt", "platelet count"],
  },
  {
    key: "sodium",
    displayName: "Sodium",
    unit: "mmol/L",
    refRangeLow: 135,
    refRangeHigh: 145,
    aliases: ["na"],
  },
  {
    key: "potassium",
    displayName: "Potassium",
    unit: "mmol/L",
    refRangeLow: 3.5,
    refRangeHigh: 5.1,
    aliases: ["k"],
  },
  {
    key: "chloride",
    displayName: "Chloride",
    unit: "mmol/L",
    refRangeLow: 98,
    refRangeHigh: 107,
    aliases: ["cl"],
  },
  {
    key: "bicarbonate",
    displayName: "Bicarbonate (CO2)",
    unit: "mmol/L",
    refRangeLow: 22,
    refRangeHigh: 29,
    aliases: ["co2", "carbon dioxide", "bicarb", "co2, total"],
  },
  {
    key: "calcium",
    displayName: "Calcium",
    unit: "mg/dL",
    refRangeLow: 8.5,
    refRangeHigh: 10.5,
    aliases: ["ca"],
  },
  {
    key: "magnesium",
    displayName: "Magnesium",
    unit: "mg/dL",
    refRangeLow: 1.7,
    refRangeHigh: 2.2,
    aliases: ["mg"],
  },
  {
    key: "phosphorus",
    displayName: "Phosphorus",
    unit: "mg/dL",
    refRangeLow: 2.5,
    refRangeHigh: 4.5,
    aliases: ["phosphate", "phos"],
  },
  {
    key: "bun",
    displayName: "BUN",
    unit: "mg/dL",
    refRangeLow: 7,
    refRangeHigh: 20,
    aliases: ["blood urea nitrogen", "urea nitrogen"],
  },
  {
    key: "uric_acid",
    displayName: "Uric Acid",
    unit: "mg/dL",
    refRangeLow: 3.5,
    refRangeHigh: 7.2,
    aliases: ["urate"],
  },
  {
    key: "albumin",
    displayName: "Albumin",
    unit: "g/dL",
    refRangeLow: 3.5,
    refRangeHigh: 5.0,
    aliases: [],
  },
  {
    key: "total_protein",
    displayName: "Total Protein",
    unit: "g/dL",
    refRangeLow: 6.0,
    refRangeHigh: 8.3,
    aliases: ["protein, total"],
  },
  {
    key: "alp",
    displayName: "Alkaline Phosphatase",
    unit: "U/L",
    refRangeLow: 44,
    refRangeHigh: 147,
    aliases: ["alp", "alk phos", "alkaline phosphatase"],
  },
  {
    key: "total_bilirubin",
    displayName: "Total Bilirubin",
    unit: "mg/dL",
    refRangeLow: 0.1,
    refRangeHigh: 1.2,
    aliases: ["bilirubin", "bilirubin, total"],
  },
  {
    key: "ggt",
    displayName: "GGT",
    unit: "U/L",
    refRangeLow: 9,
    refRangeHigh: 60,
    aliases: ["gamma-glutamyl transferase", "gamma gt"],
  },
  {
    key: "free_t4",
    displayName: "Free T4",
    unit: "ng/dL",
    refRangeLow: 0.8,
    refRangeHigh: 1.8,
    aliases: ["ft4", "t4, free", "thyroxine, free"],
  },
  {
    key: "free_t3",
    displayName: "Free T3",
    unit: "pg/mL",
    refRangeLow: 2.3,
    refRangeHigh: 4.2,
    aliases: ["ft3", "t3, free", "triiodothyronine, free"],
  },
  {
    key: "iron",
    displayName: "Iron",
    unit: "µg/dL",
    refRangeLow: 60,
    refRangeHigh: 170,
    aliases: ["iron, serum", "serum iron"],
  },
  {
    key: "tibc",
    displayName: "TIBC",
    unit: "µg/dL",
    refRangeLow: 250,
    refRangeHigh: 450,
    aliases: ["total iron binding capacity", "iron binding capacity"],
  },
  {
    key: "transferrin_saturation",
    displayName: "Transferrin Saturation",
    unit: "%",
    refRangeLow: 20,
    refRangeHigh: 50,
    aliases: ["iron saturation", "tsat", "% saturation"],
  },
  {
    key: "folate",
    displayName: "Folate",
    unit: "ng/mL",
    refRangeLow: 4,
    refRangeHigh: 20,
    aliases: ["folic acid", "vitamin b9"],
  },
  {
    key: "crp",
    displayName: "hs-CRP",
    unit: "mg/L",
    refRangeLow: null,
    refRangeHigh: 3.0,
    aliases: ["crp", "c-reactive protein", "hs-crp", "high sensitivity crp"],
  },
  {
    key: "esr",
    displayName: "ESR",
    unit: "mm/hr",
    refRangeLow: 0,
    refRangeHigh: 20,
    aliases: [
      "sed rate",
      "sedimentation rate",
      "erythrocyte sedimentation rate",
    ],
  },
  {
    key: "homocysteine",
    displayName: "Homocysteine",
    unit: "µmol/L",
    refRangeLow: 5,
    refRangeHigh: 15,
    aliases: [],
  },
  {
    key: "cortisol",
    displayName: "Cortisol (AM)",
    unit: "µg/dL",
    refRangeLow: 6,
    refRangeHigh: 23,
    aliases: ["cortisol, am", "cortisol, total"],
  },
  {
    key: "psa",
    displayName: "PSA",
    unit: "ng/mL",
    refRangeLow: null,
    refRangeHigh: 4.0,
    aliases: ["prostate specific antigen", "psa, total"],
  },
  {
    key: "testosterone",
    displayName: "Testosterone (Total)",
    unit: "ng/dL",
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ["testosterone", "testosterone, total"],
  },
  {
    key: "estradiol",
    displayName: "Estradiol",
    unit: "pg/mL",
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ["e2", "estradiol, serum"],
  },
];

export type LabRangeStatus = "low" | "high" | "in_range" | "unknown";

/** Where a value sits against a reference range; a missing bound is open-ended. */
export function labRangeStatus(
  value: number,
  low: number | null,
  high: number | null,
): LabRangeStatus {
  if (low === null && high === null) return "unknown";
  if (low !== null && value < low) return "low";
  if (high !== null && value > high) return "high";
  return "in_range";
}

/** Finds the preset a printed marker name refers to (case-insensitive). */
export function findLabMarkerPreset(name: string): LabMarkerPreset | undefined {
  const needle = name.trim().toLowerCase();
  return LAB_MARKER_PRESETS.find(
    (p) =>
      p.key === needle ||
      p.displayName.toLowerCase() === needle ||
      p.aliases.includes(needle),
  );
}
