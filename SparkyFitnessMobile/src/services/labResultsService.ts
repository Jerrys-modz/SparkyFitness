import {
  createCustomCategory,
  saveCustomMeasurement,
  updateCustomCategory,
} from './api/measurementsApi';
import { LAB_CATEGORY_FREQUENCY, type NewLabMarker } from '../utils/labResults';

export interface SaveLabResultInput {
  /** An existing marker's id, or a new marker to create first. */
  target: { categoryId: string } | { newMarker: NewLabMarker };
  value: number;
  /** Test date, `YYYY-MM-DD`. */
  date: string;
  notes?: string;
  /** New reference range to set on an existing marker before saving. */
  updateRange?: { low: number | null; high: number | null };
}

/**
 * Saves one lab result, first creating its marker (or updating an existing
 * marker's reference range) when the input asks for it. Shared by the add
 * screen and the report import so both write results the same way.
 */
export async function saveLabResult(input: SaveLabResultInput) {
  let categoryId: string;
  if ('categoryId' in input.target) {
    categoryId = input.target.categoryId;
    if (input.updateRange) {
      await updateCustomCategory(categoryId, {
        ref_range_low: input.updateRange.low,
        ref_range_high: input.updateRange.high,
      });
    }
  } else {
    const { newMarker } = input.target;
    const created = await createCustomCategory({
      name: newMarker.name,
      display_name: newMarker.display_name,
      measurement_type: newMarker.measurement_type,
      frequency: LAB_CATEGORY_FREQUENCY,
      data_type: 'numeric',
      is_lab: true,
      ref_range_low: newMarker.ref_range_low,
      ref_range_high: newMarker.ref_range_high,
    });
    categoryId = created.id;
  }
  const entry = await saveCustomMeasurement({
    category_id: categoryId,
    value: input.value,
    entry_date: input.date,
    notes: input.notes?.trim() || undefined,
    source: 'manual',
  });
  return { categoryId, entry };
}
