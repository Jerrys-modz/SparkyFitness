// Presets for lab-result markers. Picking one creates a custom category with
// `is_lab` set, the unit prefilled into `measurement_type`, and the reference
// range prefilled. Ranges are common adult defaults only; labs differ, so the
// user can edit them. `aliases` are the other names a lab report may print,
// used to match scanned results to a marker.
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
