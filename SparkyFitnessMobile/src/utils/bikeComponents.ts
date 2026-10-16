import type { TFunction } from 'i18next';
import type { BikeComponentType } from '@workspace/shared';

/** Readable name of a component type; static keys keep the i18n audit exact. */
export function componentTypeLabel(
  t: TFunction,
  type: BikeComponentType
): string {
  switch (type) {
    case 'chain':
      return t('bikes.componentType.chain', { defaultValue: 'Chain' });
    case 'cassette':
      return t('bikes.componentType.cassette', { defaultValue: 'Cassette' });
    case 'tires':
      return t('bikes.componentType.tires', { defaultValue: 'Tires' });
    case 'brake_pads':
      return t('bikes.componentType.brakePads', {
        defaultValue: 'Brake pads',
      });
    case 'cables':
      return t('bikes.componentType.cables', { defaultValue: 'Cables' });
    case 'bar_tape':
      return t('bikes.componentType.barTape', { defaultValue: 'Bar tape' });
    case 'custom':
      return t('bikes.componentType.custom', { defaultValue: 'Custom' });
  }
}

/** Moving time in seconds as whole hours and minutes, e.g. `12 h 05 min`. */
export function formatMovingTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hours} h ${String(minutes).padStart(2, '0')} min`;
}
