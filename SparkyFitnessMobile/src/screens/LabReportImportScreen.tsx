import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { labRangeStatus } from '@workspace/shared';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import { FooterSaveBar } from '../components/FormScreenChrome';
import Button from '../components/ui/Button';
import LabStatusBadge from '../components/labs/LabStatusBadge';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useCustomCategories } from '../hooks/useCustomMeasurements';
import { useProfile } from '../hooks/useProfile';
import {
  useImportLabResults,
  useScanLabReport,
} from '../hooks/useLabReportImport';
import {
  pickLabReportFromCamera,
  pickLabReportFromLibrary,
  pickLabReportPdf,
  type PickedLabReport,
} from '../services/labReportPicker';
import {
  formatDateLabel,
  getDateRelationToToday,
  getTodayDate,
} from '../utils/dateUtils';
import {
  effectiveLabRange,
  labImportSaveInput,
  planLabImport,
  reportRangeDiffers,
  type LabImportBlock,
  type LabImportRow,
} from '../utils/labReportImport';
import {
  formatLabRange,
  labSexFromGender,
  parseLabValue,
} from '../utils/labResults';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'LabReportImport'>;

interface ScannedReport {
  labName: string | null;
  rows: LabImportRow[];
  date: string;
}

const todayOrEarlier = (date: string | null): string =>
  date && getDateRelationToToday(date) !== 'future' ? date : getTodayDate();

const LabReportImportScreen: React.FC<Props> = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const calendarRef = useRef<CalendarSheetRef>(null);

  const categoriesQuery = useCustomCategories();
  const { profile } = useProfile();
  const sex = labSexFromGender(profile?.gender);
  const scan = useScanLabReport();
  const importResults = useImportLabResults();

  const [report, setReport] = useState<ScannedReport | null>(null);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [useReportRanges, setUseReportRanges] = useState(true);
  const [pickMessage, setPickMessage] = useState<string | null>(null);
  // Typed corrections to a scanned value, by row key.
  const [valueEdits, setValueEdits] = useState<Record<string, string>>({});

  const blockedText = (row: LabImportRow, reason: LabImportBlock): string => {
    switch (reason) {
      case 'unit_mismatch':
        return t('labs.import.blocked.unit', {
          defaultValue:
            'The report uses {{reportUnit}}, but this marker uses {{markerUnit}}. Units are not converted.',
          reportUnit: row.result.unit ?? '',
          markerUnit: row.markerUnit,
        });
      case 'name_taken':
        return t('labs.import.blocked.nameTaken', {
          defaultValue: 'Another measurement already uses this name.',
        });
      case 'no_unit':
        return t('labs.import.blocked.noUnit', {
          defaultValue: 'The report shows no unit for this test.',
        });
      case 'duplicate':
        return t('labs.import.blocked.duplicate', {
          defaultValue: 'Already included from this report.',
        });
    }
  };

  const handlePicked = async (picked: PickedLabReport) => {
    switch (picked.status) {
      case 'cancelled':
        return;
      case 'denied':
        setPickMessage(
          t('labs.import.cameraDenied', {
            defaultValue: 'Camera access is needed to take a photo.',
          })
        );
        return;
      case 'too_large':
        setPickMessage(
          t('labs.import.tooLarge', {
            defaultValue: 'That PDF is too large to read (limit 14 MB).',
          })
        );
        return;
      case 'failed':
        setPickMessage(
          t('labs.import.pickFailed', {
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
      const rows = planLabImport(
        response.report.results,
        categoriesQuery.data ?? [],
        sex
      );
      setExcluded(new Set(rows.filter((r) => r.blocked).map((r) => r.key)));
      setValueEdits({});
      setReport({
        labName: response.report.lab_name,
        rows,
        date: todayOrEarlier(response.report.collected_on),
      });
    } catch {
      // The error text is shown from scan.error below.
    }
  };

  const rowValue = (row: LabImportRow): number | null =>
    row.key in valueEdits
      ? parseLabValue(valueEdits[row.key])
      : row.result.value;

  const included = useMemo(
    () =>
      report?.rows.filter(
        (r) =>
          !excluded.has(r.key) &&
          !r.blocked &&
          (r.key in valueEdits
            ? parseLabValue(valueEdits[r.key]) !== null
            : true)
      ) ?? [],
    [report, excluded, valueEdits]
  );

  const handleSave = async () => {
    if (!report || included.length === 0 || importResults.isPending) return;
    const outcome = await importResults.mutateAsync(
      included.map((row) => ({
        name: row.title,
        input: labImportSaveInput(row, {
          date: report.date,
          useReportRanges,
          value: rowValue(row) ?? row.result.value,
        }),
      }))
    );
    if (outcome.failed.length === 0) {
      Toast.show({
        type: 'success',
        text1: t('labs.import.saved', {
          defaultValue_one: 'Saved {{count}} result',
          defaultValue_other: 'Saved {{count}} results',
          defaultValue: 'Saved {{count}} results',
          count: outcome.saved,
        }),
      });
      navigation.goBack();
      return;
    }
    // Keep only what failed on screen so it can be retried.
    setExcluded(
      new Set(
        report.rows
          .filter((r) => !outcome.failed.includes(r.title))
          .map((r) => r.key)
      )
    );
    Toast.show({
      type: 'error',
      text1: t('labs.import.partial', {
        defaultValue: 'Could not save: {{names}}',
        names: outcome.failed.join(', '),
      }),
    });
  };

  const canSave = included.length > 0 && !importResults.isPending;

  const header = useScreenHeader({
    title: t('screens.labReportImport', { defaultValue: 'Import report' }),
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
        busy: importResults.isPending,
        disabled: !canSave,
        placement: 'native-only',
        identifier: 'lab-report-save',
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
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        className="flex-1 px-4 py-3"
        contentContainerClassName="gap-4 pb-6"
        keyboardShouldPersistTaps="handled"
      >
        {scan.isPending ? (
          <View className="items-center py-12 gap-3">
            <ActivityIndicator />
            <Text className="text-text-secondary text-sm text-center">
              {t('labs.import.reading', {
                defaultValue: 'Reading your report...',
              })}
            </Text>
          </View>
        ) : report === null ? (
          <View className="gap-3">
            <Text className="text-text-secondary text-sm">
              {t('labs.import.intro', {
                defaultValue:
                  'Choose a lab report PDF, or a photo or screenshot of one. Your AI provider reads it and you review the results before anything is saved. The report itself is not stored.',
              })}
            </Text>
            <Button
              variant="primary"
              onPress={async () => handlePicked(await pickLabReportPdf())}
            >
              {t('labs.import.choosePdf', { defaultValue: 'Choose a PDF' })}
            </Button>
            <Button
              variant="secondary"
              onPress={async () =>
                handlePicked(await pickLabReportFromLibrary())
              }
            >
              {t('labs.import.choosePhoto', {
                defaultValue: 'Choose a photo or screenshot',
              })}
            </Button>
            <Button
              variant="secondary"
              onPress={async () =>
                handlePicked(await pickLabReportFromCamera())
              }
            >
              {t('labs.import.takePhoto', { defaultValue: 'Take a photo' })}
            </Button>
            {(pickMessage || scan.isError) && (
              <Text className="text-sm text-danger">
                {pickMessage ??
                  scan.error?.message ??
                  t('labs.import.scanFailed', {
                    defaultValue: 'Could not read that report.',
                  })}
              </Text>
            )}
          </View>
        ) : (
          <>
            {report.labName && (
              <Text className="text-text-muted text-xs">{report.labName}</Text>
            )}

            <View className="gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">
                {t('labs.date', { defaultValue: 'Date of test' })}
              </Text>
              <TouchableOpacity
                onPress={() => calendarRef.current?.present()}
                className="flex-row items-center px-3 py-2.5 rounded-lg border border-border-subtle bg-raised min-h-11"
                accessibilityRole="button"
                accessibilityLabel={t('labs.date', {
                  defaultValue: 'Date of test',
                })}
              >
                <Text className="text-base text-text-primary">
                  {formatDateLabel(report.date, t, dateLocale)}
                </Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row items-center justify-between bg-surface rounded-xl px-4 py-3">
              <View className="flex-1 mr-3">
                <Text className="text-sm font-semibold text-text-primary">
                  {t('labs.import.useReportRanges', {
                    defaultValue: "Use the report's reference ranges",
                  })}
                </Text>
                <Text className="text-xs text-text-muted mt-0.5">
                  {t('labs.import.useReportRangesHint', {
                    defaultValue:
                      'The lab prints ranges for its own method, age and sex. Existing markers are updated to match.',
                  })}
                </Text>
              </View>
              <Switch
                value={useReportRanges}
                onValueChange={setUseReportRanges}
                accessibilityLabel={t('labs.import.useReportRanges', {
                  defaultValue: "Use the report's reference ranges",
                })}
              />
            </View>

            <Text className="text-xs text-text-muted">
              {t('labs.import.editHint', {
                defaultValue:
                  'Check the values against your report. Tap a value to correct it.',
              })}
            </Text>

            <View className="bg-surface rounded-xl overflow-hidden">
              {report.rows.map((row, index) => {
                const range = effectiveLabRange(row, useReportRanges);
                const unit =
                  row.target.kind === 'existing'
                    ? row.target.category.measurement_type
                    : row.target.marker.measurement_type;
                const rangeText = formatLabRange(range.low, range.high, unit);
                const value = rowValue(row);
                const valueInvalid = value === null;
                const isIncluded =
                  !excluded.has(row.key) && !row.blocked && !valueInvalid;
                return (
                  <View
                    key={row.key}
                    className={`px-4 py-3 flex-row items-center ${
                      index > 0 ? 'border-t border-border-subtle' : ''
                    }`}
                    style={{ opacity: row.blocked ? 0.6 : 1 }}
                  >
                    <View className="flex-1 mr-3">
                      <Text className="text-base font-semibold text-text-primary">
                        {row.title}
                      </Text>
                      <Text className="text-xs text-text-muted mt-0.5">
                        {row.target.kind === 'new'
                          ? t('labs.import.newMarker', {
                              defaultValue: 'New marker',
                            })
                          : t('labs.import.existingMarker', {
                              defaultValue: 'Your marker',
                            })}
                        {rangeText ? ` · ${rangeText}` : ''}
                        {useReportRanges &&
                        row.target.kind === 'existing' &&
                        reportRangeDiffers(row)
                          ? ` · ${t('labs.import.rangeUpdated', {
                              defaultValue: 'range will update',
                            })}`
                          : ''}
                      </Text>
                      {row.blocked && (
                        <Text className="text-xs text-warning mt-0.5">
                          {blockedText(row, row.blocked)}
                        </Text>
                      )}
                    </View>
                    <View className="items-end mr-3">
                      <View className="flex-row items-center gap-1">
                        <TextInput
                          value={
                            row.key in valueEdits
                              ? valueEdits[row.key]
                              : String(row.result.value)
                          }
                          onChangeText={(text) =>
                            setValueEdits((prev) => ({
                              ...prev,
                              [row.key]: text,
                            }))
                          }
                          editable={row.blocked === null}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                          className={`min-w-14 text-right text-base font-bold border-b px-1 py-0.5 ${
                            valueInvalid
                              ? 'text-text-danger-subtle border-text-danger-subtle'
                              : 'text-text-primary border-border-subtle'
                          }`}
                          accessibilityLabel={t('labs.import.valueFor', {
                            defaultValue: 'Result for {{name}}',
                            name: row.title,
                          })}
                        />
                        <Text className="text-sm text-text-secondary">
                          {unit}
                        </Text>
                      </View>
                      {value !== null && (
                        <LabStatusBadge
                          status={labRangeStatus(value, range.low, range.high)}
                        />
                      )}
                    </View>
                    <Switch
                      value={isIncluded}
                      disabled={row.blocked !== null}
                      onValueChange={(on) => toggleRow(row.key, on)}
                      accessibilityLabel={t('labs.import.includeRow', {
                        defaultValue: 'Include {{name}}',
                        name: row.title,
                      })}
                    />
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={() => {
                setReport(null);
                scan.reset();
              }}
              accessibilityRole="button"
            >
              <Text className="text-sm font-semibold text-accent-primary text-center">
                {t('labs.import.chooseAnother', {
                  defaultValue: 'Choose a different report',
                })}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      {report !== null && !usesNativeHeader && (
        <FooterSaveBar
          onPress={handleSave}
          busy={importResults.isPending}
          disabled={!canSave}
          label={t('labs.import.saveCount', {
            defaultValue_one: 'Save {{count}} result',
            defaultValue_other: 'Save {{count}} results',
            defaultValue: 'Save {{count}} results',
            count: included.length,
          })}
        />
      )}
      <CalendarSheet
        ref={calendarRef}
        selectedDate={report?.date ?? getTodayDate()}
        onSelectDate={(d) => {
          if (getDateRelationToToday(d) === 'future') return;
          setReport((prev) => (prev ? { ...prev, date: d } : prev));
          calendarRef.current?.dismiss();
        }}
      />
    </View>
  );
};

export default LabReportImportScreen;
