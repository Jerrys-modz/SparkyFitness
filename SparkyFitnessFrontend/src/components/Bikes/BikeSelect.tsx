import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBikes } from '@/hooks/Bikes/useBikes';

const NO_BIKE = 'none';

interface BikeSelectProps {
  /** Selected bike id, or null for "no bike". */
  value: string | null;
  onChange: (bikeId: string | null) => void;
  disabled?: boolean;
  id?: string;
}

/** Picker over the user's active bikes; a retired bike stays selectable only while it is the current value. */
export const BikeSelect: React.FC<BikeSelectProps> = ({
  value,
  onChange,
  disabled,
  id,
}) => {
  const { t } = useTranslation();
  const { data: bikes = [] } = useBikes();
  const options = bikes.filter(
    (bike) => bike.status === 'active' || bike.id === value
  );

  return (
    <Select
      value={value ?? NO_BIKE}
      onValueChange={(next) => onChange(next === NO_BIKE ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={t('bikes.noBike', 'No bike')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_BIKE}>{t('bikes.noBike', 'No bike')}</SelectItem>
        {options.map((bike) => (
          <SelectItem key={bike.id} value={bike.id}>
            {bike.name}
            {bike.status === 'retired'
              ? ` (${t('bikes.retired', 'Retired')})`
              : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
