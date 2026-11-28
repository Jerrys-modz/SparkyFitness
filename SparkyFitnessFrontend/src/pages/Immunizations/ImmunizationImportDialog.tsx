import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImmunizationScanRecord } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import {
  useImportImmunizations,
  useScanImmunizations,
} from '@/hooks/Immunizations/useImmunizations';
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_FILE_BYTES,
  DOCUMENT_MAX_PHOTO_BYTES,
  documentMimeType,
  readFileAsBase64,
} from '@/utils/documentFile';

interface ImmunizationImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const rowKey = (record: ImmunizationScanRecord, index: number) =>
  `${index}|${record.vaccine_name}|${record.administered_on}`;

const ImmunizationImportDialog = ({
  open,
  onOpenChange,
}: ImmunizationImportDialogProps) => {
  const { t } = useTranslation();
  const scan = useScanImmunizations();
  const importRecords = useImportImmunizations();
  const fileInput = useRef<HTMLInputElement>(null);
  // Each picked file gets a number; a read or scan that finishes after a newer
  // pick (or a reset) is ignored, so its rows never replace the newer file's.
  const selection = useRef(0);

  const [records, setRecords] = useState<ImmunizationScanRecord[] | null>(null);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [fileError, setFileError] = useState<string | null>(null);

  const reset = () => {
    selection.current += 1;
    setRecords(null);
    setIncluded({});
    setFileError(null);
    scan.reset();
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const id = ++selection.current;
    const stale = () => id !== selection.current;
    setFileError(null);
    const mimeType = documentMimeType(file);
    if (mimeType.startsWith('image/') && file.size > DOCUMENT_MAX_PHOTO_BYTES) {
      setFileError(
        t(
          'immunizations.import.photoTooLarge',
          'That photo is too large to read (limit 6 MB). Try a smaller photo or a screenshot.'
        )
      );
      return;
    }
    if (file.size > DOCUMENT_MAX_FILE_BYTES) {
      setFileError(
        t(
          'immunizations.import.tooLarge',
          'That file is too large to read (limit 14 MB).'
        )
      );
      return;
    }
    let document: string;
    try {
      document = await readFileAsBase64(file);
    } catch {
      if (stale()) return;
      setFileError(
        t('immunizations.import.readFailed', 'Could not open that file.')
      );
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    if (stale()) return;
    try {
      const response = await scan.mutateAsync({ document, mimeType });
      if (stale()) return;
      setRecords(response.records);
      // A vaccine already recorded on that day starts unchecked, so a second
      // import of the same record does not add it twice.
      setIncluded(
        Object.fromEntries(
          response.records.map((record, index) => [
            rowKey(record, index),
            !record.already_recorded,
          ])
        )
      );
    } catch (err) {
      if (!stale()) {
        const detail = err instanceof Error ? err.message : '';
        const message = t(
          'immunizations.import.scanFailed',
          'Could not read that record.'
        );
        setFileError(detail ? `${message} ${detail}` : message);
      }
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const chosen = (records ?? []).filter(
    (record, index) => included[rowKey(record, index)]
  );

  const save = async () => {
    const id = selection.current;
    try {
      const saved = await importRecords.mutateAsync({
        records: chosen.map(({ already_recorded: _skip, ...record }) => record),
      });
      toast({
        title: t('immunizations.import.saved', {
          count: saved.created,
          defaultValue_one: 'Saved {{count}} immunization',
          defaultValue_other: 'Saved {{count}} immunizations',
        }),
      });
      if (id === selection.current) close(false);
    } catch {
      // The mutation's toast reports it; the review stays for another try.
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('immunizations.import.cta', 'Import from a record')}
          </DialogTitle>
          <DialogDescription>
            {records
              ? t(
                  'immunizations.import.reviewHint',
                  'Check the vaccines against your record. Ones you already have on that day start unchecked.'
                )
              : t(
                  'immunizations.import.intro',
                  'Choose a vaccine record PDF, or a photo or screenshot of one. Your AI provider reads it and you review the vaccines before anything is saved. The file itself is not stored.'
                )}
          </DialogDescription>
        </DialogHeader>

        {!records && (
          <div className="space-y-3">
            <input
              ref={fileInput}
              type="file"
              accept={DOCUMENT_ACCEPT}
              className="hidden"
              data-testid="immunization-file"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button
              onClick={() => fileInput.current?.click()}
              disabled={scan.isPending}
            >
              {scan.isPending
                ? t('immunizations.import.reading', 'Reading your record...')
                : t('immunizations.import.chooseFile', 'Choose a PDF or photo')}
            </Button>
            {fileError && (
              <p role="alert" className="text-sm text-destructive">
                {fileError}
              </p>
            )}
          </div>
        )}

        {records && (
          <ul className="divide-y rounded-md border">
            {records.map((record, index) => {
              const key = rowKey(record, index);
              const id = `imm-import-${index}`;
              return (
                <li key={key} className="flex items-start gap-3 p-3">
                  <Checkbox
                    id={id}
                    checked={included[key] ?? false}
                    onCheckedChange={(checked) =>
                      setIncluded((current) => ({
                        ...current,
                        [key]: checked === true,
                      }))
                    }
                  />
                  <label htmlFor={id} className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">
                      {record.vaccine_name}
                      {record.dose_number
                        ? ` · ${t('immunizations.doseShort', 'Dose {{n}}', { n: record.dose_number })}`
                        : ''}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {record.administered_on}
                      {record.administered_by
                        ? ` · ${record.administered_by}`
                        : ''}
                      {record.lot_number
                        ? ` · ${t('immunizations.lotShort', 'Lot {{lot}}', { lot: record.lot_number })}`
                        : ''}
                    </span>
                    {record.already_recorded && (
                      <span className="block text-xs text-muted-foreground">
                        {t(
                          'immunizations.import.alreadyRecorded',
                          'Already recorded'
                        )}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          {records && (
            <Button
              onClick={() => void save()}
              disabled={chosen.length === 0 || importRecords.isPending}
            >
              {importRecords.isPending
                ? t('common.saving', 'Saving...')
                : t('immunizations.import.save', {
                    count: chosen.length,
                    defaultValue_one: 'Save {{count}} immunization',
                    defaultValue_other: 'Save {{count}} immunizations',
                  })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImmunizationImportDialog;
