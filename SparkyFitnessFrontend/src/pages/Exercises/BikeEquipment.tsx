import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bike, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import type { BikeResponse, CreateBikeBody } from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useBikes,
  useCreateBikeMutation,
  useDeleteBikeMutation,
  useUpdateBikeMutation,
} from '@/hooks/Bikes/useBikes';
import { BikeFormDialog } from './BikeFormDialog';

const formatMovingTime = (seconds: number): string => {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${Math.floor(totalMinutes / 60)} h ${minutes} min`;
};

const BikeCard: React.FC<{
  bike: BikeResponse;
  onEdit: () => void;
  onDelete: () => void;
  onToggleRetired: () => void;
  /** A delegate who can only view reports sees the bike but cannot change it. */
  readOnly?: boolean;
}> = ({ bike, onEdit, onDelete, onToggleRetired, readOnly }) => {
  const { t } = useTranslation();
  const { distanceUnit, convertDistance } = usePreferences();
  const unitLabel = distanceUnit === 'miles' ? 'mi' : 'km';
  const subtitle = [bike.brand, bike.model].filter(Boolean).join(' ');
  const dueNow = bike.due_now_component_count;
  const dueSoon = bike.due_soon_component_count;

  return (
    <Card className={bike.status === 'retired' ? 'opacity-70' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="truncate">{bike.name}</span>
              {bike.is_default && (
                <Star
                  className="h-4 w-4 shrink-0 fill-current"
                  aria-label={t('bikes.default', 'Default bike')}
                />
              )}
            </CardTitle>
            {subtitle && (
              <p className="truncate text-sm text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
          {bike.status === 'retired' && (
            <Badge variant="secondary">{t('bikes.retired', 'Retired')}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="font-medium">
            {convertDistance(
              bike.total_distance_km,
              'km',
              distanceUnit
            ).toFixed(1)}{' '}
            {unitLabel}
          </span>
          <span className="text-muted-foreground">
            {formatMovingTime(bike.total_moving_time_seconds)}
          </span>
        </div>
        {bike.status === 'active' && (dueNow > 0 || dueSoon > 0) && (
          <div className="flex flex-wrap gap-2">
            {dueNow > 0 && (
              <Badge variant="destructive">
                {t('bikes.componentsDueNow', {
                  count: dueNow,
                  defaultValue: '{{count}} parts due now',
                })}
              </Badge>
            )}
            {dueSoon > 0 && (
              <Badge variant="outline">
                {t('bikes.componentsDueSoon', {
                  count: dueSoon,
                  defaultValue: '{{count}} parts due soon',
                })}
              </Badge>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {t('bikes.rideCount', {
            count: bike.ride_count,
            defaultValue: '{{count}} rides',
          })}
          {bike.last_used_date
            ? ` · ${t('bikes.lastUsed', 'last used {{date}}', { date: bike.last_used_date })}`
            : ''}
        </p>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              {t('common.edit', 'Edit')}
            </Button>
            <Button size="sm" variant="outline" onClick={onToggleRetired}>
              {bike.status === 'retired'
                ? t('bikes.reactivate', 'Reactivate')
                : t('bikes.retire', 'Retire')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              aria-label={t('common.delete', 'Delete')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Bikes inside the Equipment card: the list with distance, time and a count of
 * components that are due. Component wear itself is managed in the mobile app.
 */
const BikeEquipment: React.FC = () => {
  const { t } = useTranslation();
  const { hasWritePermission } = useActiveUser();
  // Reads follow the diary or reports permission; every change needs diary write.
  const canWrite = hasWritePermission('diary');
  const { data: bikes, isLoading } = useBikes();
  const createBike = useCreateBikeMutation();
  const updateBike = useUpdateBikeMutation();
  const deleteBike = useDeleteBikeMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BikeResponse | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BikeResponse | null>(null);

  const handleSubmit = (data: CreateBikeBody) =>
    editing
      ? updateBike.mutateAsync({ id: editing.id, data })
      : createBike.mutateAsync(data);

  const active = (bikes ?? []).filter((bike) => bike.status === 'active');
  const retired = (bikes ?? []).filter((bike) => bike.status === 'retired');

  const renderCards = (list: BikeResponse[]) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((bike) => (
        <BikeCard
          key={bike.id}
          bike={bike}
          readOnly={!canWrite}
          onEdit={() => {
            setEditing(bike);
            setDialogOpen(true);
          }}
          onDelete={() => setPendingDelete(bike)}
          onToggleRetired={() =>
            updateBike.mutate({
              id: bike.id,
              data: {
                status: bike.status === 'retired' ? 'active' : 'retired',
              },
            })
          }
        />
      ))}
    </div>
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Bike className="h-5 w-5" />
          {t('bikes.title', 'Bikes')}
        </h3>
        {canWrite && (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t('bikes.addBike', 'Add bike')}
          </Button>
        )}
      </div>
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40" />
        </div>
      ) : (bikes ?? []).length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t(
            'bikes.empty',
            'No bikes yet. Add a bike, then pick it on a ride to count its distance.'
          )}
        </p>
      ) : (
        <>
          {active.length > 0 && renderCards(active)}
          {retired.length > 0 && (
            <section className="space-y-3">
              <h4 className="text-base font-semibold text-muted-foreground">
                {t('bikes.retiredSection', 'Retired')}
              </h4>
              {renderCards(retired)}
            </section>
          )}
        </>
      )}

      <BikeFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        bike={editing}
        onSubmit={handleSubmit}
        isSaving={createBike.isPending || updateBike.isPending}
      />
      <ConfirmationDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t('bikes.deleteTitle', 'Delete this bike?')}
        description={t(
          'bikes.deleteDescription',
          'Its components are deleted. Rides logged with this bike stay in your diary, but they will no longer be linked to a bike.'
        )}
        variant="destructive"
        confirmLabel={t('common.delete', 'Delete')}
        onConfirm={() => {
          if (pendingDelete) deleteBike.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </section>
  );
};

export default BikeEquipment;
