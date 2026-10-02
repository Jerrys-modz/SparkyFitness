import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { FooterSaveBar } from '../components/FormScreenChrome';
import SeveritySlider from '../components/symptoms/SeveritySlider';
import SymptomLocationPicker from '../components/symptoms/SymptomLocationPicker';
import TreatmentsSection, {
  type MobileTreatmentDraft,
} from '../components/symptoms/TreatmentsSection';
import {
  useSymptomDefinitions,
  useSymptomEntriesDetailed,
  useSymptomActions,
} from '../hooks/useSymptoms';
import { getTodayDate } from '../utils/dateUtils';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import {
  BUILT_IN_SYMPTOM_DEFINITIONS,
  BUILT_IN_OPTIONS,
  type SymptomScaleType,
  type SymptomImpact,
  type CreateSymptomEntryBody,
} from '@workspace/shared';

type Props = NativeStackScreenProps<RootStackParamList, 'SymptomLog'>;

const IMPACT_OPTIONS: SymptomImpact[] = ['none', 'mild', 'moderate', 'severe'];

export default function SymptomLogScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { entryId, date } = route.params || {};

  const today = getTodayDate();
  const targetDate = date || today;

  const { definitions } = useSymptomDefinitions();
  const { entries } = useSymptomEntriesDetailed({
    fromDate: targetDate,
    toDate: targetDate,
  });

  const existingEntry = entryId ? entries.find((e) => e.id === entryId) : null;

  // Form State
  const [symptomName, setSymptomName] = useState(
    existingEntry?.symptom_name_snapshot ?? ''
  );
  const [symptomId, setSymptomId] = useState<string | null>(
    existingEntry?.symptom_id ?? null
  );
  const [isEpisodic, setIsEpisodic] = useState(
    Boolean(existingEntry?.started_at)
  );
  const [scaleType, setScaleType] = useState<SymptomScaleType>('1-10');
  const [severity, setSeverity] = useState<number | null>(
    existingEntry?.severity ?? 5
  );
  const [bodyLocations, setBodyLocations] = useState<string[]>(
    existingEntry?.body_locations ?? []
  );
  const [qualities, setQualities] = useState<string[]>(
    existingEntry?.qualities ?? []
  );
  const [associatedSymptoms, setAssociatedSymptoms] = useState<string[]>(
    existingEntry?.associated_symptoms ?? []
  );
  const [triggers, setTriggers] = useState<string[]>(
    existingEntry?.triggers ?? []
  );
  const [impact, setImpact] = useState<SymptomImpact | null>(
    existingEntry?.impact ?? null
  );
  const [contextText, setContextText] = useState(
    existingEntry?.context_text ?? ''
  );
  const [startedAt, setStartedAt] = useState<string | null>(
    existingEntry?.started_at ?? null
  );
  const endedAt = existingEntry?.ended_at ?? null;
  const [treatments, setTreatments] = useState<MobileTreatmentDraft[]>(() =>
    existingEntry?.treatments
      ? existingEntry.treatments.map((t) => ({
          name_snapshot: t.name_snapshot,
          kind: t.kind,
          effectiveness: t.effectiveness ?? 'unknown',
          notes: t.notes,
        }))
      : []
  );

  const { logEntry, updateEntry, endEpisode, removeEntry } =
    useSymptomActions();

  const getImpactLabel = (imp: SymptomImpact) => {
    switch (imp) {
      case 'none':
        return t('symptoms.impacts.none', { defaultValue: 'None' });
      case 'mild':
        return t('symptoms.impacts.mild', { defaultValue: 'Mild' });
      case 'moderate':
        return t('symptoms.impacts.moderate', { defaultValue: 'Moderate' });
      case 'severe':
        return t('symptoms.impacts.severe', { defaultValue: 'Severe' });
    }
  };

  // Back-dating offset handler
  const handleBackdate = (minutesBack: number) => {
    const d = new Date(Date.now() - minutesBack * 60 * 1000);
    setStartedAt(d.toISOString());
  };

  const handleSelectSymptom = (
    name: string,
    defId?: string,
    defScale?: SymptomScaleType,
    episodic?: boolean
  ) => {
    setSymptomName(name);
    setSymptomId(defId || null);
    if (defScale) setScaleType(defScale);
    if (episodic !== undefined) setIsEpisodic(episodic);
  };

  const toggleItem = (
    list: string[],
    setList: (l: string[]) => void,
    item: string
  ) => {
    if (list.includes(item)) {
      setList(list.filter((i) => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleSave = async () => {
    if (!symptomName.trim()) {
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        t('symptoms.nameRequired', {
          defaultValue: 'Please enter a name for the symptom.',
        })
      );
      return;
    }

    const payload: CreateSymptomEntryBody = {
      symptom_name_snapshot: symptomName.trim(),
      symptom_id: symptomId,
      severity,
      entry_date: targetDate,
      started_at: isEpisodic ? startedAt || new Date().toISOString() : null,
      ended_at: endedAt,
      body_locations: bodyLocations,
      qualities,
      associated_symptoms: associatedSymptoms,
      triggers,
      impact,
      context_text: contextText.trim() || null,
      treatments: treatments.map((t) => ({
        name_snapshot: t.name_snapshot,
        kind: t.kind,
        effectiveness: t.effectiveness === 'unknown' ? null : t.effectiveness,
        notes: t.notes || null,
      })),
    };

    if (existingEntry) {
      await updateEntry.mutateAsync({ id: existingEntry.id, body: payload });
    } else {
      await logEntry.mutateAsync(payload);
    }
    navigation.goBack();
  };

  const handleEndNow = async () => {
    if (!existingEntry) return;
    await endEpisode.mutateAsync({
      id: existingEntry.id,
      body: {
        ended_at: new Date().toISOString(),
        treatments: treatments.map((t) => ({
          name_snapshot: t.name_snapshot,
          kind: t.kind,
          effectiveness: t.effectiveness === 'unknown' ? null : t.effectiveness,
          notes: t.notes || null,
        })),
      },
    });
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!existingEntry) return;
    Alert.alert(
      t('symptoms.deleteTitle', { defaultValue: 'Delete Symptom Log' }),
      t('symptoms.deleteConfirm', {
        defaultValue: 'Are you sure you want to delete this entry?',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: async () => {
            await removeEntry.mutateAsync(existingEntry.id);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const header = useScreenHeader({
    title: existingEntry
      ? t('symptoms.editTitle', { defaultValue: 'Edit Symptom' })
      : t('symptoms.logTitle', { defaultValue: 'Log Symptom' }),
    left: {
      kind: 'dismiss',
      onPress: () => navigation.goBack(),
      accessibilityLabel: t('common.cancel', { defaultValue: 'Cancel' }),
    },
    right: existingEntry
      ? [
          {
            kind: 'icon',
            sfSymbol: 'trash',
            ionicon: 'trash-outline',
            onPress: handleDelete,
            accessibilityLabel: t('common.delete', { defaultValue: 'Delete' }),
            identifier: 'symptom-log-delete',
          },
          {
            kind: 'primary',
            label: t('common.save', { defaultValue: 'Save' }),
            onPress: handleSave,
            busy: logEntry.isPending || updateEntry.isPending,
            identifier: 'symptom-log-save',
          },
        ]
      : [
          {
            kind: 'icon',
            sfSymbol: 'clock.arrow.circlepath',
            ionicon: 'time-outline',
            onPress: () =>
              navigation.navigate('SymptomHistory', {
                symptomId: symptomId ?? undefined,
              }),
            accessibilityLabel: t('symptoms.history', {
              defaultValue: 'History',
            }),
            identifier: 'symptom-log-history',
          },
          {
            kind: 'primary',
            label: t('common.save', { defaultValue: 'Save' }),
            onPress: handleSave,
            busy: logEntry.isPending || updateEntry.isPending,
            identifier: 'symptom-log-save',
          },
        ],
  });

  const mapKind =
    symptomName.toLowerCase().includes('head') ||
    symptomName.toLowerCase().includes('migraine')
      ? 'head'
      : 'body';

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}

      <ScrollView
        className="flex-1 px-4 py-3 space-y-6"
        keyboardShouldPersistTaps="handled"
      >
        {/* Symptom Selection Chips */}
        <View className="space-y-2">
          <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t('symptoms.symptom', { defaultValue: 'Symptom' })}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {definitions.map((def) => {
              const selected = symptomName === def.name;
              return (
                <TouchableOpacity
                  key={def.id}
                  onPress={() =>
                    handleSelectSymptom(
                      def.name,
                      def.id,
                      def.scale_type,
                      def.is_episodic
                    )
                  }
                  className={`px-3 py-2 rounded-xl border ${
                    selected
                      ? 'bg-primary border-primary'
                      : 'bg-card border-border'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      selected ? 'text-primary-foreground' : 'text-foreground'
                    }`}
                  >
                    {def.name}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {BUILT_IN_SYMPTOM_DEFINITIONS.map((builtIn) => {
              const selected =
                symptomName === builtIn.displayName ||
                symptomName === builtIn.name;
              return (
                <TouchableOpacity
                  key={builtIn.name}
                  onPress={() =>
                    handleSelectSymptom(
                      builtIn.displayName,
                      undefined,
                      builtIn.scaleType,
                      builtIn.isEpisodic
                    )
                  }
                  className={`px-3 py-2 rounded-xl border ${
                    selected
                      ? 'bg-primary border-primary'
                      : 'bg-card border-border'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      selected ? 'text-primary-foreground' : 'text-foreground'
                    }`}
                  >
                    {builtIn.displayName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Custom Symptom Name Input */}
          <TextInput
            placeholder={t('symptoms.orCustomName', {
              defaultValue: 'Or type custom symptom...',
            })}
            placeholderTextColor="#94a3b8"
            value={symptomName}
            onChangeText={(text) => handleSelectSymptom(text)}
            className="bg-card border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground mt-2"
          />
        </View>

        {/* Ongoing vs Quick Log & Timing */}
        <View className="bg-card border border-border p-3.5 rounded-2xl space-y-3">
          <View className="flex-row justify-between items-center">
            <Text className="text-sm font-semibold text-foreground">
              {t('symptoms.ongoingEpisode', {
                defaultValue: 'Track as ongoing episode',
              })}
            </Text>
            <TouchableOpacity
              onPress={() => setIsEpisodic(!isEpisodic)}
              className={`w-12 h-6 rounded-full p-0.5 ${
                isEpisodic ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <View
                className={`w-5 h-5 rounded-full bg-white transition-all ${
                  isEpisodic ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </TouchableOpacity>
          </View>

          {isEpisodic && (
            <View className="space-y-2 pt-2 border-t border-border/50">
              <Text className="text-xs text-muted-foreground">
                {t('symptoms.startedWhen', { defaultValue: 'Started when:' })}
              </Text>
              <View className="flex-row gap-1.5 flex-wrap">
                <TouchableOpacity
                  onPress={() => setStartedAt(new Date().toISOString())}
                  className="px-2.5 py-1.5 rounded-lg bg-background border border-border"
                >
                  <Text className="text-xs font-medium text-foreground">
                    {t('symptoms.timing.now', { defaultValue: 'Now' })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleBackdate(15)}
                  className="px-2.5 py-1.5 rounded-lg bg-background border border-border"
                >
                  <Text className="text-xs font-medium text-foreground">
                    {t('symptoms.timing.m15', { defaultValue: '-15m' })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleBackdate(60)}
                  className="px-2.5 py-1.5 rounded-lg bg-background border border-border"
                >
                  <Text className="text-xs font-medium text-foreground">
                    {t('symptoms.timing.h1', { defaultValue: '-1h' })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleBackdate(180)}
                  className="px-2.5 py-1.5 rounded-lg bg-background border border-border"
                >
                  <Text className="text-xs font-medium text-foreground">
                    {t('symptoms.timing.h3', { defaultValue: '-3h' })}
                  </Text>
                </TouchableOpacity>
              </View>

              {existingEntry && !endedAt && (
                <TouchableOpacity
                  onPress={handleEndNow}
                  className="bg-amber-500/20 border border-amber-500/40 py-2.5 rounded-xl items-center mt-2"
                >
                  <Text className="text-xs font-bold text-amber-500">
                    {t('symptoms.endEpisodeNow', {
                      defaultValue: 'End Episode Now',
                    })}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Severity */}
        <View className="bg-card border border-border p-3.5 rounded-2xl">
          <SeveritySlider
            scaleType={scaleType}
            value={severity}
            onChange={setSeverity}
          />
        </View>

        {/* Location Picker */}
        <View className="bg-card border border-border p-3.5 rounded-2xl space-y-2">
          <Text className="text-sm font-semibold text-foreground">
            {t('symptoms.location', { defaultValue: 'Location' })}
          </Text>
          <SymptomLocationPicker
            kind={mapKind}
            selected={bodyLocations}
            onToggle={(label) =>
              toggleItem(bodyLocations, setBodyLocations, label)
            }
          />
        </View>

        {/* Qualities / Descriptors */}
        <View className="bg-card border border-border p-3.5 rounded-2xl space-y-2">
          <Text className="text-sm font-semibold text-foreground">
            {t('symptoms.qualities', { defaultValue: 'Pain Qualities' })}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {BUILT_IN_OPTIONS.quality.map((q) => {
              const isSelected = qualities.includes(q);
              return (
                <TouchableOpacity
                  key={q}
                  onPress={() => toggleItem(qualities, setQualities, q)}
                  className={`px-3 py-1.5 rounded-full border ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500'
                      : 'bg-background border-border'
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      isSelected
                        ? 'text-blue-500 font-semibold'
                        : 'text-foreground'
                    }`}
                  >
                    {q}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Associated Symptoms / Aura */}
        <View className="bg-card border border-border p-3.5 rounded-2xl space-y-2">
          <Text className="text-sm font-semibold text-foreground">
            {t('symptoms.associated', {
              defaultValue: 'Associated Symptoms / Aura',
            })}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {BUILT_IN_OPTIONS.associated.map((item) => {
              const isSelected = associatedSymptoms.includes(item);
              return (
                <TouchableOpacity
                  key={item}
                  onPress={() =>
                    toggleItem(associatedSymptoms, setAssociatedSymptoms, item)
                  }
                  className={`px-3 py-1.5 rounded-full border ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500'
                      : 'bg-background border-border'
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      isSelected
                        ? 'text-blue-500 font-semibold'
                        : 'text-foreground'
                    }`}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Triggers */}
        <View className="bg-card border border-border p-3.5 rounded-2xl space-y-2">
          <Text className="text-sm font-semibold text-foreground">
            {t('symptoms.triggers', { defaultValue: 'Triggers' })}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {BUILT_IN_OPTIONS.trigger.map((tr) => {
              const isSelected = triggers.includes(tr);
              return (
                <TouchableOpacity
                  key={tr}
                  onPress={() => toggleItem(triggers, setTriggers, tr)}
                  className={`px-3 py-1.5 rounded-full border ${
                    isSelected
                      ? 'bg-amber-600/20 border-amber-500'
                      : 'bg-background border-border'
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      isSelected
                        ? 'text-amber-500 font-semibold'
                        : 'text-foreground'
                    }`}
                  >
                    {tr}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Treatments & Relief */}
        <View className="bg-card border border-border p-3.5 rounded-2xl space-y-2">
          <Text className="text-sm font-semibold text-foreground">
            {t('symptoms.treatments', { defaultValue: 'Treatments & Relief' })}
          </Text>
          <TreatmentsSection treatments={treatments} onChange={setTreatments} />
        </View>

        {/* Impact on Day */}
        <View className="bg-card border border-border p-3.5 rounded-2xl space-y-2">
          <Text className="text-sm font-semibold text-foreground">
            {t('symptoms.impact', { defaultValue: 'Impact on Day' })}
          </Text>
          <View className="flex-row gap-1.5">
            {IMPACT_OPTIONS.map((opt) => {
              const isSelected = impact === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  onPress={() => setImpact(isSelected ? null : opt)}
                  className={`flex-1 py-2 rounded-xl items-center border ${
                    isSelected
                      ? 'bg-primary border-primary'
                      : 'bg-background border-border'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      isSelected ? 'text-primary-foreground' : 'text-foreground'
                    }`}
                  >
                    {getImpactLabel(opt)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Notes */}
        <View className="bg-card border border-border p-3.5 rounded-2xl space-y-2">
          <Text className="text-sm font-semibold text-foreground">
            {t('symptoms.notes', { defaultValue: 'Notes & Observations' })}
          </Text>
          <TextInput
            multiline
            numberOfLines={3}
            placeholder={t('symptoms.notesPlaceholder', {
              defaultValue: 'Any additional notes or observations...',
            })}
            placeholderTextColor="#94a3b8"
            value={contextText}
            onChangeText={setContextText}
            className="bg-background border border-border rounded-xl p-3 text-sm text-foreground min-h-[80px]"
          />
        </View>

        <View className="h-20" />
      </ScrollView>

      {/* Sticky Save Bar */}
      <FooterSaveBar
        onPress={handleSave}
        busy={logEntry.isPending || updateEntry.isPending}
        label={
          existingEntry
            ? t('common.save', { defaultValue: 'Save' })
            : t('symptoms.logSymptom', { defaultValue: 'Log Symptom' })
        }
      />
    </View>
  );
}
