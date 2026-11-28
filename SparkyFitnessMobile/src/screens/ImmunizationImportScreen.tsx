import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type { ImmunizationScanRecord } from '@workspace/shared';
import { FooterSaveBar } from '../components/FormScreenChrome';
import Button from '../components/ui/Button';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  useImportImmunizations,
  useScanImmunizations,
} from '../hooks/useImmunizations';
// The picker is not specific to lab reports: it reads any PDF or photo.
import {
  pickLabReportFromCamera,
  pickLabReportFromLibrary,
  pickLabReportPdf,
  type PickedLabReport,
} from '../services/labReportPicker';
import { formatDateLabel } from '../utils/dateUtils';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ImmunizationImport'>;

const rowKey = (record: ImmunizationScanRecord, index: number) =>
  `${index}|${record.vaccine_name}|${record.administered_on}`;

/** Reads a vaccine record with the user's AI and saves the vaccines they keep. */
const ImmunizationImportScreen: React.FC<Props> = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const scan = useScanImmunizations();
  const importRecords = useImportImmunizations();

  const [records, setRecords] = useState<ImmunizationScanRecord[] | null>(null);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [pickMessage, setPickMessage] = useState<string | null>(null);

  const handlePicked = async (picked: PickedLabReport) => {
    switch (picked.status) {
      case 'cancelled':
        return;
      case 'denied':
        setPickMessage(
          t('immunizations.import.cameraDenied', {
            defaultValue: 'Camera access is needed to take a photo.',
          })
        );
        return;
      case 'too_large':
        setPickMessage(
          t('immunizations.import.tooLarge', {
            defaultValue: 'That PDF is too large to read (limit 14 MB).',
          })
        );
        return;
      case 'failed':
        setPickMessage(
          t('immunizations.import.pickFailed', {
            defaultValue: 'Could not open that file.',
          })
        );
        return;
      case 'ok':
        break;
    }
    setPickMessage(null);
    try {
      const response = await scan.mutateAsync({
        document: picked.document,
        mimeType: picked.mimeType,
      });
      // A vaccine already recorded on that day starts off, so a second import
      // of the same record does not add it twice.
      setExcluded(
        new Set(
          response.records
            .map((record, index) => [record, index] as const)
            .filter(([record]) => record.already_recorded)
            .map(([record, index]) => rowKey(record, index))
        )
      );
      setRecords(response.records);
    } catch {
      // The error text is shown from scan.error below.
    }
  };

  const chosen = (records ?? []).filter(
    (record, index) => !excluded.has(rowKey(record, index))
  );
  const canSave = chosen.length > 0 && !importRecords.isPending;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await importRecords.mutateAsync({
        records: chosen.map(({ already_recorded: _skip, ...record }) => record),
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: t('immunizations.import.saveFailed', {
          defaultValue: 'Could not save the records. Nothing was saved.',
        }),
      });
      return;
    }
    Toast.show({
      type: 'success',
      text1: t('immunizations.import.saved', {
        defaultValue_one: 'Saved {{count}} immunization',
        defaultValue_other: 'Saved {{count}} immunizations',
        defaultValue: 'Saved {{count}} immunizations',
        count: chosen.length,
      }),
    });
    navigation.goBack();
  };

  const header = useScreenHeader({
    title: t('screens.immunizationImport', {
      defaultValue: 'Import record',
    }),
    left: {
      kind: 'dismiss',
      onPress: () => navigation.goBack(),
      accessibilityLabel: t('common.cancel', { defaultValue: 'Cancel' }),
    },
    right: [
      {
        kind: 'primary',
        label: t('common.save', { defaultValue: 'Save' }),
        onPress: handleSave,
        busy: importRecords.isPending,
        disabled: !canSave,
        placement: 'native-only',
        identifier: 'immunization-import-save',
      },
    ],
  });

  const toggleRow = (key: string, on: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (on) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        className="flex-1 px-4 py-3"
        contentContainerClassName="gap-4 pb-6"
      >
        {scan.isPending ? (
          <View className="items-center py-12 gap-3">
            <ActivityIndicator />
            <Text className="text-text-secondary text-sm text-center">
              {t('immunizations.import.reading', {
                defaultValue: 'Reading your record...',
              })}
            </Text>
          </View>
        ) : records === null ? (
          <View className="gap-3">
            <Text className="text-text-secondary text-sm">
              {t('immunizations.import.intro', {
                defaultValue:
                  'Choose a vaccine record PDF, or a photo or screenshot of one. Your AI provider reads it and you review the vaccines before anything is saved. The file itself is not stored.',
              })}
            </Text>
            <Button
              variant="primary"
              onPress={async () => handlePicked(await pickLabReportPdf())}
            >
              {t('immunizations.import.choosePdf', {
                defaultValue: 'Choose a PDF',
              })}
            </Button>
            <Button
              variant="secondary"
              onPress={async () =>
                handlePicked(await pickLabReportFromLibrary())
              }
            >
              {t('immunizations.import.choosePhoto', {
                defaultValue: 'Choose a photo or screenshot',
              })}
            </Button>
            <Button
              variant="secondary"
              onPress={async () =>
                handlePicked(await pickLabReportFromCamera())
              }
            >
              {t('immunizations.import.takePhoto', {
                defaultValue: 'Take a photo',
              })}
            </Button>
            {(pickMessage || scan.isError) && (
              <Text className="text-sm text-danger">
                {pickMessage ??
                  scan.error?.message ??
                  t('immunizations.import.scanFailed', {
                    defaultValue: 'Could not read that record.',
                  })}
              </Text>
            )}
          </View>
        ) : (
          <>
            <Text className="text-xs text-text-muted">
              {t('immunizations.import.reviewHint', {
                defaultValue:
                  'Check the vaccines against your record. Ones you already have on that day start off.',
              })}
            </Text>
            <View className="bg-surface rounded-xl overflow-hidden">
              {records.map((record, index) => {
                const key = rowKey(record, index);
                return (
                  <View
                    key={key}
                    className={`px-4 py-3 flex-row items-center ${
                      index > 0 ? 'border-t border-border-subtle' : ''
                    }`}
                  >
                    <View className="flex-1 mr-3">
                      <Text className="text-base font-semibold text-text-primary">
                        {record.vaccine_name}
                        {record.dose_number
                          ? ` · ${t('immunizations.doseShort', {
                              defaultValue: 'Dose {{n}}',
                              n: record.dose_number,
                            })}`
                          : ''}
                      </Text>
                      <Text className="text-xs text-text-muted mt-0.5">
                        {formatDateLabel(record.administered_on, t, dateLocale)}
                        {record.administered_by
                          ? ` · ${record.administered_by}`
                          : ''}
                      </Text>
                      {record.already_recorded && (
                        <Text className="text-xs text-warning mt-0.5">
                          {t('immunizations.import.alreadyRecorded', {
                            defaultValue: 'Already recorded',
                          })}
                        </Text>
                      )}
                    </View>
                    <Switch
                      value={!excluded.has(key)}
                      onValueChange={(on) => toggleRow(key, on)}
                      accessibilityLabel={t('immunizations.import.include', {
                        defaultValue: 'Include {{name}}',
                        name: record.vaccine_name,
                      })}
                    />
                  </View>
                );
              })}
            </View>
            <TouchableOpacity
              onPress={() => {
                setRecords(null);
                scan.reset();
              }}
              accessibilityRole="button"
            >
              <Text className="text-sm font-semibold text-accent-primary text-center">
                {t('immunizations.import.chooseAnother', {
                  defaultValue: 'Choose a different record',
                })}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      {records !== null && !usesNativeHeader && (
        <FooterSaveBar
          onPress={handleSave}
          busy={importRecords.isPending}
          disabled={!canSave}
          label={t('immunizations.import.saveCount', {
            defaultValue_one: 'Save {{count}} immunization',
            defaultValue_other: 'Save {{count}} immunizations',
            defaultValue: 'Save {{count}} immunizations',
            count: chosen.length,
          })}
        />
      )}
    </View>
  );
};

export default ImmunizationImportScreen;
