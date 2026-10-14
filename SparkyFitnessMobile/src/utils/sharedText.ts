import type { TFunction } from 'i18next';

/**
 * Display text for names that `@workspace/shared` ships in English (GLP-1
 * medications, vitamins and minerals, macro fields). The English name is what
 * gets stored on supplements and entries, so this only translates what is
 * shown. Text without an entry, such as a name the user typed, is returned as is.
 */
export function getSharedTexts(t: TFunction): Record<string, string> {
  return {
    Semaglutide: t('sharedText.semaglutide_10avf0r', {
      defaultValue: 'Semaglutide',
    }),
    'Semaglutide (oral)': t('sharedText.semaglutideOral_1ikztm2', {
      defaultValue: 'Semaglutide (oral)',
    }),
    Tirzepatide: t('sharedText.tirzepatide_3wn08e', {
      defaultValue: 'Tirzepatide',
    }),
    Dulaglutide: t('sharedText.dulaglutide_lpe5ll', {
      defaultValue: 'Dulaglutide',
    }),
    Liraglutide: t('sharedText.liraglutide_nxg0z3', {
      defaultValue: 'Liraglutide',
    }),
    Retatrutide: t('sharedText.retatrutide_q1uyxc', {
      defaultValue: 'Retatrutide',
    }),
    Calories: t('sharedText.calories_1a69s69', { defaultValue: 'Calories' }),
    Protein: t('sharedText.protein_1klaqhs', { defaultValue: 'Protein' }),
    Carbohydrates: t('sharedText.carbohydrates_1ys174u', {
      defaultValue: 'Carbohydrates',
    }),
    Fat: t('sharedText.fat_9aser8', { defaultValue: 'Fat' }),
    'Dietary fiber': t('sharedText.dietaryFiber_xzur71', {
      defaultValue: 'Dietary fiber',
    }),
    'Vitamin A': t('sharedText.vitaminA_1jooija', {
      defaultValue: 'Vitamin A',
    }),
    'Vitamin D': t('sharedText.vitaminD_1l2mj05', {
      defaultValue: 'Vitamin D',
    }),
    'Vitamin E': t('sharedText.vitaminE_1ksmxb6', {
      defaultValue: 'Vitamin E',
    }),
    'Vitamin K': t('sharedText.vitaminK_1lcm4p4', {
      defaultValue: 'Vitamin K',
    }),
    'Vitamin C': t('sharedText.vitaminC_1j4pb5c', {
      defaultValue: 'Vitamin C',
    }),
    'Thiamin (B1)': t('sharedText.thiaminB1_8kek93', {
      defaultValue: 'Thiamin (B1)',
    }),
    'Riboflavin (B2)': t('sharedText.riboflavinB2_1x1hnq8', {
      defaultValue: 'Riboflavin (B2)',
    }),
    'Niacin (B3)': t('sharedText.niacinB3_7jx1dj', {
      defaultValue: 'Niacin (B3)',
    }),
    'Vitamin B6': t('sharedText.vitaminB6_1m87cbz', {
      defaultValue: 'Vitamin B6',
    }),
    'Folate (B9)': t('sharedText.folateB9_mrr8uq', {
      defaultValue: 'Folate (B9)',
    }),
    'Vitamin B12': t('sharedText.vitaminB12_1s75mvg', {
      defaultValue: 'Vitamin B12',
    }),
    'Biotin (B7)': t('sharedText.biotinB7_k4y296', {
      defaultValue: 'Biotin (B7)',
    }),
    'Pantothenic Acid (B5)': t('sharedText.pantothenicAcidB5_1402imd', {
      defaultValue: 'Pantothenic Acid (B5)',
    }),
    Choline: t('sharedText.choline_1fc4f2x', { defaultValue: 'Choline' }),
    Calcium: t('sharedText.calcium_16f2kyp', { defaultValue: 'Calcium' }),
    Iron: t('sharedText.iron_1kkaoij', { defaultValue: 'Iron' }),
    Magnesium: t('sharedText.magnesium_5k98r3', { defaultValue: 'Magnesium' }),
    Zinc: t('sharedText.zinc_es7c9r', { defaultValue: 'Zinc' }),
    Selenium: t('sharedText.selenium_xml221', { defaultValue: 'Selenium' }),
    Copper: t('sharedText.copper_1r76bg4', { defaultValue: 'Copper' }),
    Manganese: t('sharedText.manganese_1pico2e', { defaultValue: 'Manganese' }),
    Chromium: t('sharedText.chromium_443fm9', { defaultValue: 'Chromium' }),
    Molybdenum: t('sharedText.molybdenum_1fpk48l', {
      defaultValue: 'Molybdenum',
    }),
    Iodine: t('sharedText.iodine_1j6isbn', { defaultValue: 'Iodine' }),
    Phosphorus: t('sharedText.phosphorus_8yadbq', {
      defaultValue: 'Phosphorus',
    }),
    Potassium: t('sharedText.potassium_1pr2a8i', { defaultValue: 'Potassium' }),
    Sodium: t('sharedText.sodium_sd8gfa', { defaultValue: 'Sodium' }),
    'Omega-3 (EPA+DHA)': t('sharedText.omega3EPADHA_5vchlr', {
      defaultValue: 'Omega-3 (EPA+DHA)',
    }),
    'Omega-3 EPA': t('sharedText.omega3EPA_1syf0gw', {
      defaultValue: 'Omega-3 EPA',
    }),
    'Omega-3 DHA': t('sharedText.omega3DHA_17jx6lf', {
      defaultValue: 'Omega-3 DHA',
    }),
    'Coenzyme Q10': t('sharedText.coenzymeQ10_wc78v1', {
      defaultValue: 'Coenzyme Q10',
    }),
    Creatine: t('sharedText.creatine_16mupe8', { defaultValue: 'Creatine' }),
    Caffeine: t('sharedText.caffeine_1mfwpn6', { defaultValue: 'Caffeine' }),
    Alcohol: t('sharedText.alcohol_1aaj8al', { defaultValue: 'Alcohol' }),
  };
}

export function sharedText(
  texts: Record<string, string>,
  text: string
): string {
  return Object.prototype.hasOwnProperty.call(texts, text)
    ? (texts[text] as string)
    : text;
}
