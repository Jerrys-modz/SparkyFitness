import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Footprints, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import type { CreateShoeBody, ShoeResponse } from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useCreateShoeMutation,
  useDeleteShoeMutation,
  useShoes,
  useUpdateShoeMutation,
} from '@/hooks/Shoes/useShoes';
import { ShoeFormDialog } from './ShoeFormDialog';

const ShoeCard: React.FC<{
  shoe: ShoeResponse;
  onEdit: () => void;
  onDelete: () => void;
  onToggleRetired: () => void;
}> = ({ shoe, onEdit, onDelete, onToggleRetired }) => {
  const { t } = useTranslation();
  const { distanceUnit, convertDistance } = usePreferences();
  const unitLabel = distanceUnit === 'miles' ? 'mi' : 'km';
  const show = (km: number) =>
    convertDistance(km, 'km', distanceUnit).toFixed(1);
  const percent = Math.min(
    100,
    (shoe.total_distance_km / shoe.retirement_distance_km) * 100
  );
  const subtitle = [shoe.brand, shoe.model].filter(Boolean).join(' ');

  return (
    <Card className={shoe.status === 'retired' ? 'opacity-70' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="truncate">{shoe.nickname || shoe.name}</span>
              {shoe.is_default && (
                <Star
                  className="h-4 w-4 shrink-0 fill-current"
                  aria-label={t('shoes.default', 'Default pair')}
                />
              )}
            </CardTitle>
            <CardDescription className="truncate">
              {shoe.nickname
                ? [shoe.name, subtitle].filter(Boolean).join(' · ')
                : subtitle}
            </CardDescription>
          </div>
          {shoe.status === 'retired' ? (
            <Badge variant="secondary">{t('shoes.retired', 'Retired')}</Badge>
          ) : shoe.is_worn_out ? (
            <Badge variant="destructive">
              {t('shoes.wornOut', 'Worn out')}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium">
              {show(shoe.total_distance_km)} {unitLabel}
            </span>
            <span className="text-muted-foreground">
              {t('shoes.ofLimit', 'of {{limit}} {{unit}}', {
                limit: show(shoe.retirement_distance_km),
                unit: unitLabel,
              })}
            </span>
          </div>
          <Progress
            value={percent}
            className="h-2"
            aria-label={t('shoes.mileage', 'Mileage')}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('shoes.runCount', {
            count: shoe.run_count,
            defaultValue: '{{count}} runs',
          })}
          {shoe.last_used_date
            ? ` · ${t('shoes.lastUsed', 'last used {{date}}', { date: shoe.last_used_date })}`
            : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            {t('common.edit', 'Edit')}
          </Button>
          <Button size="sm" variant="outline" onClick={onToggleRetired}>
            {shoe.status === 'retired'
              ? t('shoes.reactivate', 'Reactivate')
              : t('shoes.retire', 'Retire')}
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
      </CardContent>
    </Card>
  );
};

const Shoes: React.FC = () => {
  const { t } = useTranslation();
  const { data: shoes, isLoading } = useShoes();
  const createShoe = useCreateShoeMutation();
  const updateShoe = useUpdateShoeMutation();
  const deleteShoe = useDeleteShoeMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ShoeResponse | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ShoeResponse | null>(null);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (shoe: ShoeResponse) => {
    setEditing(shoe);
    setDialogOpen(true);
  };
  const handleSubmit = (data: CreateShoeBody) =>
    editing
      ? updateShoe.mutateAsync({ id: editing.id, data })
      : createShoe.mutateAsync(data);

  const active = (shoes ?? []).filter((shoe) => shoe.status === 'active');
  const retired = (shoes ?? []).filter((shoe) => shoe.status === 'retired');

  const renderCards = (list: ShoeResponse[]) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((shoe) => (
        <ShoeCard
          key={shoe.id}
          shoe={shoe}
          onEdit={() => openEdit(shoe)}
          onDelete={() => setPendingDelete(shoe)}
          onToggleRetired={() =>
            updateShoe.mutate({
              id: shoe.id,
              data: {
                status: shoe.status === 'retired' ? 'active' : 'retired',
              },
            })
          }
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Footprints className="h-6 w-6" />
            {t('shoes.title', 'Shoes')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              'shoes.subtitle',
              'Keep track of the mileage on each pair of running shoes.'
            )}
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-1 h-4 w-4" />
          {t('shoes.addShoe', 'Add shoe')}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : (shoes ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t(
              'shoes.empty',
              'No shoes yet. Add a pair, then pick it on a run to start counting its mileage.'
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {active.length > 0 && renderCards(active)}
          {retired.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">
                {t('shoes.retiredSection', 'Retired')}
              </h2>
              {renderCards(retired)}
            </section>
          )}
        </>
      )}

      <ShoeFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        shoe={editing}
        onSubmit={handleSubmit}
        isSaving={createShoe.isPending || updateShoe.isPending}
      />
      <ConfirmationDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t('shoes.deleteTitle', 'Delete this shoe?')}
        description={t(
          'shoes.deleteDescription',
          'Runs logged with this pair stay in your diary, but they will no longer be linked to a shoe.'
        )}
        variant="destructive"
        confirmLabel={t('common.delete', 'Delete')}
        onConfirm={() => {
          if (pendingDelete) deleteShoe.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
};

export default Shoes;
