import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileUp, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  immunizationDueStatus,
  todayInZone,
  type ImmunizationResponse,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useDeleteImmunization,
  useImmunizations,
} from '@/hooks/Immunizations/useImmunizations';
import ImmunizationDialog from './ImmunizationDialog';
import ImmunizationImportDialog from './ImmunizationImportDialog';

const Immunizations = () => {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const immunizations = useImmunizations();
  const deleteMutation = useDeleteImmunization();

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<ImmunizationResponse | null>(null);
  const [deleting, setDeleting] = useState<ImmunizationResponse | null>(null);

  const today = todayInZone(timezone);
  const records = immunizations.data ?? [];

  const dueBadge = (record: ImmunizationResponse) => {
    const status = immunizationDueStatus(record.next_due_on, today);
    if (status === 'overdue') {
      return (
        <Badge variant="destructive">
          {t('immunizations.status.overdue', 'Overdue')}
        </Badge>
      );
    }
    if (status === 'due_soon') {
      return (
        <Badge variant="secondary">
          {t('immunizations.status.dueSoon', 'Due soon')}
        </Badge>
      );
    }
    return null;
  };

  return (
    <div className="container mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {t('nav.immunizations', 'Immunizations')}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp className="mr-2 h-4 w-4" />
            {t('immunizations.import.cta', 'Import from a record')}
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('immunizations.add', 'Add immunization')}
          </Button>
        </div>
      </div>

      {immunizations.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : immunizations.isError ? (
        <Card>
          <CardContent
            role="alert"
            className="py-10 text-center text-destructive"
          >
            {t(
              'immunizations.loadFailed',
              'Could not load your immunizations.'
            )}
          </CardContent>
        </Card>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t(
              'immunizations.empty',
              'No immunizations yet. Add the vaccines you have had to keep them in one place.'
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul
              className="divide-y"
              aria-label={t('nav.immunizations', 'Immunizations')}
            >
              {records.map((record) => (
                <li
                  key={record.id}
                  className="flex items-center justify-between gap-2 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {record.vaccine_name}
                        {record.dose_number
                          ? ` · ${t('immunizations.doseShort', 'Dose {{n}}', { n: record.dose_number })}`
                          : ''}
                      </span>
                      {dueBadge(record)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {record.administered_on}
                      {record.administered_by
                        ? ` · ${record.administered_by}`
                        : ''}
                      {record.next_due_on
                        ? ` · ${t('immunizations.nextDueOn', 'Next due {{date}}', { date: record.next_due_on })}`
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('common.edit', 'Edit')}
                      onClick={() => setEditing(record)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t(
                        'immunizations.deleteTitle',
                        'Delete immunization'
                      )}
                      onClick={() => setDeleting(record)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {(addOpen || editing) && (
        <ImmunizationDialog
          key={editing?.id ?? 'new'}
          open
          onOpenChange={(open) => {
            if (!open) {
              setAddOpen(false);
              setEditing(null);
            }
          }}
          immunization={editing}
        />
      )}

      {importOpen && (
        <ImmunizationImportDialog open onOpenChange={setImportOpen} />
      )}

      <ConfirmationDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('immunizations.deleteTitle', 'Delete immunization')}
        description={t(
          'immunizations.deleteMessage',
          'Delete this immunization record? This cannot be undone.'
        )}
        variant="destructive"
        confirmLabel={t('common.delete', 'Delete')}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
};

export default Immunizations;
