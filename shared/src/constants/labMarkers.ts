// Presets for lab-result markers. Each preset defines a stable key, display
// name, unit, default reference range, and aliases. Built-in markers are not
// stored in the database; their `key` is kept in `lab_results.marker_key`.
// Ranges are common adult defaults only; labs differ, so the user can edit
// them. `refRangeLow`/`refRangeHigh` are the sex-neutral default; markers that
// differ by sex also have an entry in `LAB_MARKER_SEX_RANGES`, which
// `labPresetRange` prefers when the profile's sex is known. Markers with no
// sensible single default have no range. Age is not used. `aliases` are the
// other names a lab report may print, used to match scanned results to a
// marker. `loinc` holds the marker's LOINC codes.
//
// The LOINC codes are content from LOINC (https://loinc.org): LOINC® is
// copyright © 1995 Regenstrief Institute, Inc. and the LOINC Committee, and
// available at no cost under the license at https://loinc.org/license. Only
// the code numbers of laboratory tests are used here, none of the LOINC
// content that carries third-party copyright.
export interface LabMarkerPreset {
  /** Stable key. Built-in markers store it in `lab_results.marker_key`. */
  key: string;
  displayName: string;
  unit: string;
  refRangeLow: number | null;
  refRangeHigh: number | null;
  aliases: readonly string[];
  /**
   * LOINC codes for this marker, the most common first. A result coded with
   * any of them (from a FHIR record or a report that prints codes) is this
   * marker. Codes for another specimen or method of the same test are listed
   * when the value means the same thing; a code that changes the meaning,
   * such as non-fasting glucose for fasting glucose, is not.
   */
  loinc: readonly string[];
}

export const LAB_MARKER_PRESETS: readonly LabMarkerPreset[] = [
  {
    key: 'hba1c',
    displayName: 'HbA1c',
    unit: '%',
    refRangeLow: 4,
    refRangeHigh: 5.6,
    aliases: [
      'hemoglobin a1c',
      'glycated hemoglobin',
      'glycohemoglobin',
      'a1c',
    ],
    loinc: ['4548-4', '17856-6', '4549-2'],
  },
  {
    key: 'fasting_glucose',
    displayName: 'Fasting Glucose',
    unit: 'mg/dL',
    refRangeLow: 70,
    refRangeHigh: 99,
    aliases: ['glucose', 'glucose, fasting', 'fasting blood sugar', 'fbs'],
    loinc: ['1558-6'],
  },
  {
    key: 'total_cholesterol',
    displayName: 'Total Cholesterol',
    unit: 'mg/dL',
    refRangeLow: null,
    refRangeHigh: 200,
    aliases: ['cholesterol', 'cholesterol, total'],
    loinc: ['2093-3'],
  },
  {
    key: 'hdl',
    displayName: 'HDL Cholesterol',
    unit: 'mg/dL',
    refRangeLow: 40,
    refRangeHigh: null,
    aliases: ['hdl', 'hdl-c', 'hdl cholesterol'],
    loinc: ['2085-9'],
  },
  {
    key: 'ldl',
    displayName: 'LDL Cholesterol',
    unit: 'mg/dL',
    refRangeLow: null,
    refRangeHigh: 100,
    aliases: ['ldl', 'ldl-c', 'ldl cholesterol', 'ldl cholesterol calc'],
    loinc: ['13457-7', '18262-6', '2089-1'],
  },
  {
    key: 'triglycerides',
    displayName: 'Triglycerides',
    unit: 'mg/dL',
    refRangeLow: null,
    refRangeHigh: 150,
    aliases: ['trigs', 'tg'],
    loinc: ['2571-8'],
  },
  {
    key: 'vitamin_d',
    displayName: 'Vitamin D (25-OH)',
    unit: 'ng/mL',
    refRangeLow: 30,
    refRangeHigh: 100,
    aliases: ['vitamin d', '25-hydroxyvitamin d', '25-oh vitamin d', 'vit d'],
    loinc: ['62292-8', '83070-3', '68438-1'],
  },
  {
    key: 'tsh',
    displayName: 'TSH',
    unit: 'mIU/L',
    refRangeLow: 0.4,
    refRangeHigh: 4.0,
    aliases: ['thyroid stimulating hormone', 'thyrotropin'],
    loinc: ['3016-3', '11580-8'],
  },
  {
    key: 'ferritin',
    displayName: 'Ferritin',
    unit: 'ng/mL',
    refRangeLow: 30,
    refRangeHigh: 400,
    aliases: [],
    loinc: ['2276-4'],
  },
  {
    key: 'vitamin_b12',
    displayName: 'Vitamin B12',
    unit: 'pg/mL',
    refRangeLow: 200,
    refRangeHigh: 900,
    aliases: ['b12', 'cobalamin'],
    loinc: ['2132-9'],
  },
  {
    key: 'creatinine',
    displayName: 'Creatinine',
    unit: 'mg/dL',
    refRangeLow: 0.6,
    refRangeHigh: 1.3,
    aliases: [],
    loinc: ['2160-0'],
  },
  {
    key: 'egfr',
    displayName: 'eGFR',
    unit: 'mL/min/1.73m²',
    refRangeLow: 60,
    refRangeHigh: null,
    aliases: ['estimated gfr', 'gfr'],
    loinc: ['33914-3', '62238-1', '98979-8'],
  },
  {
    key: 'alt',
    displayName: 'ALT',
    unit: 'U/L',
    refRangeLow: 7,
    refRangeHigh: 56,
    aliases: ['alanine aminotransferase', 'sgpt'],
    loinc: ['1742-6', '1743-4'],
  },
  {
    key: 'ast',
    displayName: 'AST',
    unit: 'U/L',
    refRangeLow: 10,
    refRangeHigh: 40,
    aliases: ['aspartate aminotransferase', 'sgot'],
    loinc: ['1920-8'],
  },
  {
    key: 'non_hdl',
    displayName: 'Non-HDL Cholesterol',
    unit: 'mg/dL',
    refRangeLow: null,
    refRangeHigh: 130,
    aliases: ['non-hdl', 'non hdl', 'non-hdl cholesterol'],
    loinc: ['43396-1'],
  },
  {
    key: 'apob',
    displayName: 'Apolipoprotein B',
    unit: 'mg/dL',
    refRangeLow: null,
    refRangeHigh: 90,
    aliases: ['apo b', 'apob', 'apolipoprotein b'],
    loinc: ['1884-6'],
  },
  {
    key: 'vldl',
    displayName: 'VLDL Cholesterol',
    unit: 'mg/dL',
    refRangeLow: 5,
    refRangeHigh: 40,
    aliases: ['vldl', 'vldl cholesterol', 'vldl cholesterol cal'],
    loinc: ['13458-5', '2091-7'],
  },
  {
    key: 'fasting_insulin',
    displayName: 'Fasting Insulin',
    unit: 'µIU/mL',
    refRangeLow: 2,
    refRangeHigh: 25,
    aliases: ['insulin', 'insulin, fasting'],
    loinc: ['20448-7', '27873-9'],
  },
  {
    key: 'wbc',
    displayName: 'White Blood Cells',
    unit: '10³/µL',
    refRangeLow: 4.0,
    refRangeHigh: 11.0,
    aliases: ['wbc', 'white blood cell count', 'leukocytes'],
    loinc: ['6690-2', '26464-8'],
  },
  {
    key: 'rbc',
    displayName: 'Red Blood Cells',
    unit: '10⁶/µL',
    refRangeLow: 4.2,
    refRangeHigh: 5.9,
    aliases: ['rbc', 'red blood cell count', 'erythrocytes'],
    loinc: ['789-8', '26453-1'],
  },
  {
    key: 'hemoglobin',
    displayName: 'Hemoglobin',
    unit: 'g/dL',
    refRangeLow: 12.0,
    refRangeHigh: 17.5,
    aliases: ['hgb', 'hb'],
    loinc: ['718-7'],
  },
  {
    key: 'hematocrit',
    displayName: 'Hematocrit',
    unit: '%',
    refRangeLow: 36,
    refRangeHigh: 52,
    aliases: ['hct'],
    loinc: ['4544-3', '20570-8'],
  },
  {
    key: 'mcv',
    displayName: 'MCV',
    unit: 'fL',
    refRangeLow: 80,
    refRangeHigh: 100,
    aliases: ['mean corpuscular volume'],
    loinc: ['787-2', '30428-7'],
  },
  {
    key: 'platelets',
    displayName: 'Platelets',
    unit: '10³/µL',
    refRangeLow: 150,
    refRangeHigh: 450,
    aliases: ['plt', 'platelet count'],
    loinc: ['777-3', '26515-7'],
  },
  {
    key: 'sodium',
    displayName: 'Sodium',
    unit: 'mmol/L',
    refRangeLow: 135,
    refRangeHigh: 145,
    aliases: ['na'],
    loinc: ['2951-2', '2947-0'],
  },
  {
    key: 'potassium',
    displayName: 'Potassium',
    unit: 'mmol/L',
    refRangeLow: 3.5,
    refRangeHigh: 5.1,
    aliases: ['k'],
    loinc: ['2823-3', '6298-4'],
  },
  {
    key: 'chloride',
    displayName: 'Chloride',
    unit: 'mmol/L',
    refRangeLow: 98,
    refRangeHigh: 107,
    aliases: ['cl'],
    loinc: ['2075-0'],
  },
  {
    key: 'bicarbonate',
    displayName: 'Bicarbonate (CO2)',
    unit: 'mmol/L',
    refRangeLow: 22,
    refRangeHigh: 29,
    aliases: ['co2', 'carbon dioxide', 'bicarb', 'co2, total'],
    loinc: ['2028-9', '1963-8'],
  },
  {
    key: 'calcium',
    displayName: 'Calcium',
    unit: 'mg/dL',
    refRangeLow: 8.5,
    refRangeHigh: 10.5,
    aliases: ['ca'],
    loinc: ['17861-6'],
  },
  {
    key: 'magnesium',
    displayName: 'Magnesium',
    unit: 'mg/dL',
    refRangeLow: 1.7,
    refRangeHigh: 2.2,
    aliases: ['mg'],
    loinc: ['19123-9', '2601-3'],
  },
  {
    key: 'phosphorus',
    displayName: 'Phosphorus',
    unit: 'mg/dL',
    refRangeLow: 2.5,
    refRangeHigh: 4.5,
    aliases: ['phosphate', 'phos'],
    loinc: ['2777-1'],
  },
  {
    key: 'bun',
    displayName: 'BUN',
    unit: 'mg/dL',
    refRangeLow: 7,
    refRangeHigh: 20,
    aliases: ['blood urea nitrogen', 'urea nitrogen'],
    loinc: ['3094-0', '6299-2'],
  },
  {
    key: 'uric_acid',
    displayName: 'Uric Acid',
    unit: 'mg/dL',
    refRangeLow: 3.5,
    refRangeHigh: 7.2,
    aliases: ['urate'],
    loinc: ['3084-1'],
  },
  {
    key: 'albumin',
    displayName: 'Albumin',
    unit: 'g/dL',
    refRangeLow: 3.5,
    refRangeHigh: 5.0,
    aliases: [],
    loinc: ['1751-7'],
  },
  {
    key: 'total_protein',
    displayName: 'Total Protein',
    unit: 'g/dL',
    refRangeLow: 6.0,
    refRangeHigh: 8.3,
    aliases: ['protein, total'],
    loinc: ['2885-2'],
  },
  {
    key: 'alp',
    displayName: 'Alkaline Phosphatase',
    unit: 'U/L',
    refRangeLow: 44,
    refRangeHigh: 147,
    aliases: ['alp', 'alk phos', 'alkaline phosphatase'],
    loinc: ['6768-6'],
  },
  {
    key: 'total_bilirubin',
    displayName: 'Total Bilirubin',
    unit: 'mg/dL',
    refRangeLow: 0.1,
    refRangeHigh: 1.2,
    aliases: ['bilirubin', 'bilirubin, total'],
    loinc: ['1975-2'],
  },
  {
    key: 'ggt',
    displayName: 'GGT',
    unit: 'U/L',
    refRangeLow: 9,
    refRangeHigh: 60,
    aliases: ['gamma-glutamyl transferase', 'gamma gt'],
    loinc: ['2324-2'],
  },
  {
    key: 'free_t4',
    displayName: 'Free T4',
    unit: 'ng/dL',
    refRangeLow: 0.8,
    refRangeHigh: 1.8,
    aliases: ['ft4', 't4, free', 'thyroxine, free'],
    loinc: ['3024-7'],
  },
  {
    key: 'free_t3',
    displayName: 'Free T3',
    unit: 'pg/mL',
    refRangeLow: 2.3,
    refRangeHigh: 4.2,
    aliases: ['ft3', 't3, free', 'triiodothyronine, free'],
    loinc: ['3051-0'],
  },
  {
    key: 'iron',
    displayName: 'Iron',
    unit: 'µg/dL',
    refRangeLow: 60,
    refRangeHigh: 170,
    aliases: ['iron, serum', 'serum iron'],
    loinc: ['2498-4'],
  },
  {
    key: 'tibc',
    displayName: 'TIBC',
    unit: 'µg/dL',
    refRangeLow: 250,
    refRangeHigh: 450,
    aliases: ['total iron binding capacity', 'iron binding capacity'],
    loinc: ['2500-7'],
  },
  {
    key: 'transferrin_saturation',
    displayName: 'Transferrin Saturation',
    unit: '%',
    refRangeLow: 20,
    refRangeHigh: 50,
    aliases: ['iron saturation', 'tsat', '% saturation'],
    loinc: ['2502-3'],
  },
  {
    key: 'folate',
    displayName: 'Folate',
    unit: 'ng/mL',
    refRangeLow: 4,
    refRangeHigh: 20,
    aliases: ['folic acid', 'vitamin b9'],
    loinc: ['2284-8'],
  },
  {
    key: 'crp',
    displayName: 'hs-CRP',
    unit: 'mg/L',
    refRangeLow: null,
    refRangeHigh: 3.0,
    aliases: ['crp', 'c-reactive protein', 'hs-crp', 'high sensitivity crp'],
    loinc: ['30522-7', '1988-5'],
  },
  {
    key: 'esr',
    displayName: 'ESR',
    unit: 'mm/hr',
    refRangeLow: 0,
    refRangeHigh: 20,
    aliases: [
      'sed rate',
      'sedimentation rate',
      'erythrocyte sedimentation rate',
    ],
    loinc: ['4537-7', '30341-2'],
  },
  {
    key: 'homocysteine',
    displayName: 'Homocysteine',
    unit: 'µmol/L',
    refRangeLow: 5,
    refRangeHigh: 15,
    aliases: [],
    loinc: ['13965-9'],
  },
  {
    key: 'cortisol',
    displayName: 'Cortisol (AM)',
    unit: 'µg/dL',
    refRangeLow: 6,
    refRangeHigh: 23,
    aliases: ['cortisol, am', 'cortisol, total'],
    loinc: ['2143-6', '9813-7'],
  },
  {
    key: 'psa',
    displayName: 'PSA',
    unit: 'ng/mL',
    refRangeLow: null,
    refRangeHigh: 4.0,
    aliases: ['prostate specific antigen', 'psa, total'],
    loinc: ['2857-1', '35741-8', '83112-3'],
  },
  {
    key: 'testosterone',
    displayName: 'Testosterone (Total)',
    unit: 'ng/dL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['testosterone', 'testosterone, total'],
    loinc: ['2986-8'],
  },
  {
    key: 'estradiol',
    displayName: 'Estradiol',
    unit: 'pg/mL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['e2', 'estradiol, serum'],
    loinc: ['2243-4'],
  },
  {
    key: 'lipoprotein_a',
    displayName: 'Lipoprotein(a)',
    unit: 'nmol/L',
    refRangeLow: null,
    refRangeHigh: 75,
    aliases: ['lp(a)', 'lp a', 'lipoprotein a'],
    loinc: ['43583-4', '10835-7'],
  },
  {
    key: 'ketones',
    displayName: 'Ketones (Beta-Hydroxybutyrate)',
    unit: 'mmol/L',
    refRangeLow: null,
    refRangeHigh: 0.5,
    aliases: ['bhb', 'beta-hydroxybutyrate', 'ketones, blood'],
    loinc: ['6873-4', '29512-1'],
  },
  {
    key: 'c_peptide',
    displayName: 'C-Peptide',
    unit: 'ng/mL',
    refRangeLow: 0.8,
    refRangeHigh: 3.1,
    aliases: ['c peptide'],
    loinc: ['1986-9'],
  },
  {
    key: 'fructosamine',
    displayName: 'Fructosamine',
    unit: 'µmol/L',
    refRangeLow: 200,
    refRangeHigh: 285,
    aliases: [],
    loinc: ['15069-8'],
  },
  {
    key: 'neutrophils',
    displayName: 'Neutrophils',
    unit: '10³/µL',
    refRangeLow: 1.5,
    refRangeHigh: 8.0,
    aliases: ['neutrophils, absolute', 'absolute neutrophils', 'anc'],
    loinc: ['751-8', '26499-4'],
  },
  {
    key: 'lymphocytes',
    displayName: 'Lymphocytes',
    unit: '10³/µL',
    refRangeLow: 1.0,
    refRangeHigh: 4.8,
    aliases: ['lymphocytes, absolute', 'absolute lymphocytes'],
    loinc: ['731-0', '26474-7'],
  },
  {
    key: 'monocytes',
    displayName: 'Monocytes',
    unit: '10³/µL',
    refRangeLow: 0.2,
    refRangeHigh: 1.0,
    aliases: ['monocytes, absolute', 'absolute monocytes'],
    loinc: ['742-7', '26484-6'],
  },
  {
    key: 'eosinophils',
    displayName: 'Eosinophils',
    unit: '10³/µL',
    refRangeLow: null,
    refRangeHigh: 0.5,
    aliases: ['eosinophils, absolute', 'absolute eosinophils'],
    loinc: ['711-2', '26449-9'],
  },
  {
    key: 'mch',
    displayName: 'MCH',
    unit: 'pg',
    refRangeLow: 27,
    refRangeHigh: 33,
    aliases: ['mean corpuscular hemoglobin'],
    loinc: ['785-6'],
  },
  {
    key: 'mchc',
    displayName: 'MCHC',
    unit: 'g/dL',
    refRangeLow: 32,
    refRangeHigh: 36,
    aliases: ['mean corpuscular hemoglobin concentration'],
    loinc: ['786-4'],
  },
  {
    key: 'rdw',
    displayName: 'RDW',
    unit: '%',
    refRangeLow: 11.5,
    refRangeHigh: 14.5,
    aliases: ['red cell distribution width'],
    loinc: ['788-0'],
  },
  {
    key: 'mpv',
    displayName: 'MPV',
    unit: 'fL',
    refRangeLow: 7.5,
    refRangeHigh: 12.5,
    aliases: ['mean platelet volume'],
    loinc: ['32623-1'],
  },
  {
    key: 'globulin',
    displayName: 'Globulin',
    unit: 'g/dL',
    refRangeLow: 2.0,
    refRangeHigh: 3.5,
    aliases: ['globulin, total'],
    loinc: ['10834-0'],
  },
  {
    key: 'direct_bilirubin',
    displayName: 'Direct Bilirubin',
    unit: 'mg/dL',
    refRangeLow: null,
    refRangeHigh: 0.3,
    aliases: ['bilirubin, direct', 'conjugated bilirubin'],
    loinc: ['1968-7'],
  },
  {
    key: 'anion_gap',
    displayName: 'Anion Gap',
    unit: 'mmol/L',
    refRangeLow: 4,
    refRangeHigh: 12,
    aliases: [],
    loinc: ['33037-3', '1863-0'],
  },
  {
    key: 'bun_creatinine_ratio',
    displayName: 'BUN/Creatinine Ratio',
    unit: 'ratio',
    refRangeLow: 10,
    refRangeHigh: 20,
    aliases: ['bun/creatinine', 'bun creatinine ratio'],
    loinc: ['3097-3'],
  },
  {
    key: 'cystatin_c',
    displayName: 'Cystatin C',
    unit: 'mg/L',
    refRangeLow: 0.5,
    refRangeHigh: 1.0,
    aliases: ['cystatin-c'],
    loinc: ['33863-2'],
  },
  {
    key: 'urine_albumin_creatinine',
    displayName: 'Urine Albumin/Creatinine Ratio',
    unit: 'mg/g',
    refRangeLow: null,
    refRangeHigh: 30,
    aliases: [
      'uacr',
      'acr',
      'microalbumin/creatinine ratio',
      'albumin/creatinine ratio, urine',
    ],
    loinc: ['9318-7', '14959-1'],
  },
  {
    key: 'amylase',
    displayName: 'Amylase',
    unit: 'U/L',
    refRangeLow: 30,
    refRangeHigh: 110,
    aliases: [],
    loinc: ['1798-8'],
  },
  {
    key: 'lipase',
    displayName: 'Lipase',
    unit: 'U/L',
    refRangeLow: null,
    refRangeHigh: 60,
    aliases: [],
    loinc: ['3040-3'],
  },
  {
    key: 'ldh',
    displayName: 'LDH',
    unit: 'U/L',
    refRangeLow: 120,
    refRangeHigh: 246,
    aliases: ['lactate dehydrogenase'],
    loinc: ['2532-0', '14804-9'],
  },
  {
    key: 'ck',
    displayName: 'Creatine Kinase',
    unit: 'U/L',
    refRangeLow: 30,
    refRangeHigh: 200,
    aliases: ['ck, total', 'cpk', 'creatine phosphokinase'],
    loinc: ['2157-6'],
  },
  {
    key: 'ammonia',
    displayName: 'Ammonia',
    unit: 'µmol/L',
    refRangeLow: 15,
    refRangeHigh: 45,
    aliases: [],
    loinc: ['16362-6', '1841-6'],
  },
  {
    key: 'zinc',
    displayName: 'Zinc',
    unit: 'µg/dL',
    refRangeLow: 60,
    refRangeHigh: 120,
    aliases: ['zinc, serum'],
    loinc: ['5763-8'],
  },
  {
    key: 'copper',
    displayName: 'Copper',
    unit: 'µg/dL',
    refRangeLow: 70,
    refRangeHigh: 140,
    aliases: ['copper, serum'],
    loinc: ['5631-7'],
  },
  {
    key: 'selenium',
    displayName: 'Selenium',
    unit: 'µg/L',
    refRangeLow: 70,
    refRangeHigh: 150,
    aliases: ['selenium, serum'],
    loinc: ['5724-0'],
  },
  {
    key: 'vitamin_b6',
    displayName: 'Vitamin B6',
    unit: 'µg/L',
    refRangeLow: 5,
    refRangeHigh: 50,
    aliases: ['pyridoxal 5-phosphate', 'b6', 'pyridoxine'],
    loinc: ['30552-4', '62236-5'],
  },
  {
    key: 'vitamin_a',
    displayName: 'Vitamin A',
    unit: 'µg/dL',
    refRangeLow: 30,
    refRangeHigh: 95,
    aliases: ['retinol'],
    loinc: ['2923-1'],
  },
  {
    key: 'vitamin_e',
    displayName: 'Vitamin E',
    unit: 'mg/L',
    refRangeLow: 5.5,
    refRangeHigh: 17,
    aliases: ['alpha-tocopherol', 'tocopherol'],
    loinc: ['1823-4'],
  },
  {
    key: 'pth',
    displayName: 'PTH',
    unit: 'pg/mL',
    refRangeLow: 15,
    refRangeHigh: 65,
    aliases: ['parathyroid hormone', 'pth, intact'],
    loinc: ['2731-8'],
  },
  {
    key: 'igf_1',
    displayName: 'IGF-1',
    unit: 'ng/mL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['igf1', 'insulin-like growth factor 1', 'somatomedin c'],
    loinc: ['2484-4'],
  },
  {
    key: 'dhea_s',
    displayName: 'DHEA-S',
    unit: 'µg/dL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['dheas', 'dhea sulfate', 'dehydroepiandrosterone sulfate'],
    loinc: ['2191-5'],
  },
  {
    key: 'free_testosterone',
    displayName: 'Free Testosterone',
    unit: 'pg/mL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['testosterone, free'],
    loinc: ['2991-8'],
  },
  {
    key: 'shbg',
    displayName: 'SHBG',
    unit: 'nmol/L',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['sex hormone binding globulin'],
    loinc: ['13967-5'],
  },
  {
    key: 'fsh',
    displayName: 'FSH',
    unit: 'mIU/mL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['follicle stimulating hormone'],
    loinc: ['15067-2'],
  },
  {
    key: 'lh',
    displayName: 'LH',
    unit: 'mIU/mL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: ['luteinizing hormone'],
    loinc: ['10501-5'],
  },
  {
    key: 'progesterone',
    displayName: 'Progesterone',
    unit: 'ng/mL',
    refRangeLow: null,
    refRangeHigh: null,
    aliases: [],
    loinc: ['2839-9'],
  },
  {
    key: 'prolactin',
    displayName: 'Prolactin',
    unit: 'ng/mL',
    refRangeLow: null,
    refRangeHigh: 25,
    aliases: ['prl'],
    loinc: ['2842-3'],
  },
  {
    key: 'tpo_antibodies',
    displayName: 'TPO Antibodies',
    unit: 'IU/mL',
    refRangeLow: null,
    refRangeHigh: 35,
    aliases: ['tpo', 'thyroid peroxidase antibodies', 'anti-tpo'],
    loinc: ['8099-4'],
  },
];

export type LabSex = 'male' | 'female';

export interface LabRange {
  readonly low: number | null;
  readonly high: number | null;
}

const r = (low: number | null, high: number | null): LabRange => ({
  low,
  high,
});

/** Typical adult ranges by sex, for the markers where they differ. */
export const LAB_MARKER_SEX_RANGES: Readonly<
  Record<string, Record<LabSex, LabRange>>
> = {
  hdl: { male: r(40, null), female: r(50, null) },
  ferritin: { male: r(24, 336), female: r(11, 307) },
  creatinine: { male: r(0.74, 1.35), female: r(0.59, 1.04) },
  alt: { male: r(7, 55), female: r(7, 45) },
  ast: { male: r(10, 40), female: r(9, 32) },
  ggt: { male: r(8, 61), female: r(5, 36) },
  rbc: { male: r(4.5, 5.9), female: r(4.1, 5.1) },
  hemoglobin: { male: r(13.5, 17.5), female: r(12.0, 15.5) },
  hematocrit: { male: r(41, 53), female: r(36, 46) },
  uric_acid: { male: r(3.4, 7.0), female: r(2.4, 6.0) },
  esr: { male: r(0, 15), female: r(0, 20) },
  iron: { male: r(65, 175), female: r(50, 170) },
  transferrin_saturation: { male: r(20, 50), female: r(15, 50) },
  testosterone: { male: r(264, 916), female: r(15, 70) },
  free_testosterone: { male: r(50, 210), female: r(1.0, 8.5) },
  shbg: { male: r(10, 57), female: r(18, 144) },
  // Female estradiol swings across the cycle, so it has no default.
  estradiol: { male: r(10, 40), female: r(null, null) },
  // PSA is a prostate marker; there is no female range.
  psa: { male: r(null, 4.0), female: r(null, null) },
};

/** True when the preset has a different range for each sex. */
export function hasSexSpecificRange(preset: LabMarkerPreset): boolean {
  return preset.key in LAB_MARKER_SEX_RANGES;
}

/**
 * The reference range to prefill for a preset: the sex-specific one when the
 * profile's sex is known, otherwise the sex-neutral default.
 */
export function labPresetRange(
  preset: LabMarkerPreset,
  sex: LabSex | null | undefined
): LabRange {
  const bySex = sex ? LAB_MARKER_SEX_RANGES[preset.key]?.[sex] : undefined;
  return bySex ?? { low: preset.refRangeLow, high: preset.refRangeHigh };
}

export type LabRangeStatus = 'low' | 'high' | 'in_range' | 'unknown';

/** Where a value sits against a reference range; a missing bound is open-ended. */
export function labRangeStatus(
  value: number,
  low: number | null,
  high: number | null
): LabRangeStatus {
  if (low === null && high === null) return 'unknown';
  if (low !== null && value < low) return 'low';
  if (high !== null && value > high) return 'high';
  return 'in_range';
}

const PRESET_BY_LOINC: ReadonlyMap<string, LabMarkerPreset> = new Map(
  LAB_MARKER_PRESETS.flatMap((preset) =>
    preset.loinc.map((code) => [code, preset] as const)
  )
);

/** The preset a LOINC code belongs to, if any built-in marker uses it. */
export function findLabMarkerPresetByLoinc(
  code: string
): LabMarkerPreset | undefined {
  return PRESET_BY_LOINC.get(code.trim());
}

/** Finds the preset a printed marker name refers to (case-insensitive). */
export function findLabMarkerPreset(name: string): LabMarkerPreset | undefined {
  const needle = name.trim().toLowerCase();
  return LAB_MARKER_PRESETS.find(
    (p) =>
      p.key === needle ||
      p.displayName.toLowerCase() === needle ||
      p.aliases.includes(needle)
  );
}
