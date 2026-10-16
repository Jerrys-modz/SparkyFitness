import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BikeResponse, CreateBikeBody } from '@workspace/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePreferences } from '@/contexts/PreferencesContext';

interface BikeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The bike being edited; omit to add a new one. */
  bike?: BikeResponse | null;
  onSubmit: (data: CreateBikeBody) => Promise<unknown>;
  isSaving: boolean;
}

const optionalText = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export const BikeFormDialog: React.FC<BikeFormDialogProps> = ({
  open,
  onOpenChange,
  bike,
  onSubmit,
  isSaving,
}) => {
  const { t } = useTranslation();
  const { distanceUnit, convertDistance } = usePreferences();
  const unitLabel = distanceUnit === 'miles' ? 'mi' : 'km';
  // Distances are stored in km; the form edits them in the user's unit.
  const toDisplay = (km: number) =>
    String(Number(convertDistance(km, 'km', distanceUnit).toFixed(1)));

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [startingDistance, setStartingDistance] = useState('0');
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(bike?.name ?? '');
    setBrand(bike?.brand ?? '');
    setModel(bike?.model ?? '');
    setStartingDistance(bike ? toDisplay(bike.starting_distance_km) : '0');
    setIsDefault(bike?.is_default ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bike]);

  const startingValue = Number(startingDistance || 0);
  const isValid =
    name.trim() !== '' && startingValue >= 0 && !Number.isNaN(startingValue);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid) return;
    try {
      await onSubmit({
        name: name.trim(),
        brand: optionalText(brand),
        model: optionalText(model),
        // An untouched field keeps the stored km value: converting the
        // rounded display string back would drift it.
        starting_distance_km:
          bike && startingDistance === toDisplay(bike.starting_distance_km)
            ? bike.starting_distance_km
            : convertDistance(startingValue, distanceUnit, 'km'),
        is_default: isDefault,
      });
      onOpenChange(false);
    } catch {
      // The mutation already shows the error toast; keep the dialog open.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {bike
                ? t('bikes.editBike', 'Edit bike')
                : t('bikes.addBike', 'Add bike')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'bikes.formDescription',
                'Track the distance on a bike. Components and their wear are managed in the mobile app.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="bike-name">{t('bikes.name', 'Name')}</Label>
            <Input
              id="bike-name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="bike-brand">{t('bikes.brand', 'Brand')}</Label>
              <Input
                id="bike-brand"
                value={brand}
                maxLength={120}
                onChange={(e) => setBrand(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bike-model">{t('bikes.model', 'Model')}</Label>
              <Input
                id="bike-model"
                value={model}
                maxLength={120}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bike-starting">
              {t('bikes.startingDistance', 'Starting distance ({{unit}})', {
                unit: unitLabel,
              })}
            </Label>
            <Input
              id="bike-starting"
              type="number"
              min="0"
              step="0.1"
              value={startingDistance}
              onChange={(e) => setStartingDistance(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="bike-default" className="cursor-pointer">
              {t('bikes.useAsDefault', 'Use as my default bike')}
            </Label>
            <Switch
              id="bike-default"
              checked={isDefault}
              onCheckedChange={setIsDefault}
              disabled={bike?.status === 'retired'}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={!isValid || isSaving}>
              {isSaving
                ? t('common.saving', 'Saving...')
                : t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
