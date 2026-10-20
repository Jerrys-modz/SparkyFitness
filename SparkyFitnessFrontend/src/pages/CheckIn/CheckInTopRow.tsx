import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { todayInZone } from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { TimeInput } from '@/components/ui/TimeInput';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { MoodEntry } from '@/types/mood';
import {
  defaultCheckinTime,
  draftFromEntry,
  hasCheckinContent,
  type CheckinDraft,
} from '@/utils/moodCheckins';
import MoodMeter from './MoodMeter';
import { MoodCheckinList } from './MoodCheckinList';
import HomeDashboardFasting from './HomeDashboardFasting';

interface CheckInTopRowProps {
  selectedDate: string;
  /** The selected day's check-ins, in time order. */
  checkins: MoodEntry[];
  isLoadingCheckins: boolean;
  isSavingCheckin: boolean;
  /** Each resolves to whether the request succeeded. */
  onCreateCheckin: (draft: CheckinDraft) => Promise<boolean>;
  onUpdateCheckin: (entry: MoodEntry, draft: CheckinDraft) => Promise<boolean>;
  onDeleteCheckin: (entry: MoodEntry) => Promise<boolean>;
}

/** The composer, tied to the day it composes for. */
interface Composer {
  date: string;
  /** The check-in being edited, or null for a new one. */
  editing: MoodEntry | null;
  draft: CheckinDraft;
}

const freshComposer = (date: string, tz: string): Composer => ({
  date,
  editing: null,
  draft: {
    mood: null,
    energy: null,
    focus: null,
    notes: '',
    tags: [],
    time: defaultCheckinTime(date, tz),
  },
});

const isTime = (value: string) => /^\d{2}:\d{2}$/.test(value);

export const CheckInTopRow = ({
  selectedDate,
  checkins,
  isLoadingCheckins,
  isSavingCheckin,
  onCreateCheckin,
  onUpdateCheckin,
  onDeleteCheckin,
}: CheckInTopRowProps) => {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const timeLabelId = useId();
  const listTitleId = useId();
  const composerRef = useRef<HTMLDivElement>(null);

  const [composer, setComposer] = useState(() =>
    freshComposer(selectedDate, timezone)
  );
  const [pendingDelete, setPendingDelete] = useState<MoodEntry | null>(null);

  // A new day cancels any edit and starts a fresh check-in, so nothing is
  // saved against the wrong day. Adjusted during render, React's pattern for
  // state that follows a prop.
  if (composer.date !== selectedDate) {
    setComposer(freshComposer(selectedDate, timezone));
  }

  const { draft, editing } = composer;
  const updateDraft = (patch: Partial<CheckinDraft>) =>
    setComposer((prev) => ({ ...prev, draft: { ...prev.draft, ...patch } }));

  // After a request resolves, start over only if the composer still holds
  // what was sent; the day may have changed or another edit begun meanwhile.
  const resetIf = (stillCurrent: (prev: Composer) => boolean) =>
    setComposer((prev) =>
      stillCurrent(prev) ? freshComposer(prev.date, timezone) : prev
    );

  const canSave =
    hasCheckinContent(draft) && isTime(draft.time) && !isSavingCheckin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    if (editing) {
      const ok = await onUpdateCheckin(editing, draft);
      if (ok) resetIf((prev) => prev.editing?.id === editing.id);
    } else {
      const day = composer.date;
      const ok = await onCreateCheckin(draft);
      if (ok) resetIf((prev) => prev.date === day && prev.editing === null);
    }
  };

  const startEdit = (entry: MoodEntry) => {
    setComposer({
      date: selectedDate,
      editing: entry,
      draft: draftFromEntry(entry, timezone),
    });
    // On narrow screens the composer sits above the list, out of view.
    composerRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const confirmDelete = async () => {
    const entry = pendingDelete;
    setPendingDelete(null);
    if (!entry) return;
    const ok = await onDeleteCheckin(entry);
    if (ok) resetIf((prev) => prev.editing?.id === entry.id);
  };

  const isToday = selectedDate === todayInZone(timezone);

  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
      <Card ref={composerRef} className="scroll-mt-4">
        <CardHeader>
          <CardTitle>
            {editing
              ? t('checkIn.editCheckin', 'Edit check-in')
              : t('checkIn.newCheckin', 'New check-in')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="max-w-[12rem] space-y-1.5">
              <Label id={timeLabelId}>{t('checkIn.checkinTime', 'Time')}</Label>
              <TimeInput
                aria-labelledby={timeLabelId}
                value={draft.time}
                onChange={(time) => updateDraft({ time })}
                required
              />
            </div>
            <MoodMeter
              mood={draft.mood}
              notes={draft.notes}
              moodTags={draft.tags}
              energy={draft.energy}
              focus={draft.focus}
              onMoodChange={(mood) => updateDraft({ mood })}
              onNotesChange={(notes) => updateDraft({ notes })}
              onTagsChange={(tags) => updateDraft({ tags })}
              onEnergyChange={(energy) => updateDraft({ energy })}
              onFocusChange={(focus) => updateDraft({ focus })}
            />
            <div className="flex justify-center gap-2 pt-2">
              {editing && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setComposer(freshComposer(selectedDate, timezone))
                  }
                >
                  {t('checkIn.cancelEdit', 'Cancel')}
                </Button>
              )}
              <Button type="submit" size="sm" disabled={!canSave}>
                {isSavingCheckin
                  ? t('checkIn.saving', 'Saving...')
                  : editing
                    ? t('checkIn.saveChanges', 'Save changes')
                    : t('checkIn.addCheckin', 'Add check-in')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card
          role="region"
          aria-labelledby={listTitleId}
          aria-busy={isLoadingCheckins}
        >
          <CardHeader>
            <CardTitle id={listTitleId} className="text-xl">
              {isToday
                ? t('checkIn.dayCheckins', "Today's check-ins")
                : t('checkIn.otherDayCheckins', 'Check-ins')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingCheckins ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (
              <MoodCheckinList
                checkins={checkins}
                editingId={editing?.id ?? null}
                onEdit={startEdit}
                onDelete={setPendingDelete}
              />
            )}
          </CardContent>
        </Card>
        <HomeDashboardFasting />
      </div>

      <ConfirmationDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        onConfirm={confirmDelete}
        title={t('checkIn.deleteCheckinTitle', 'Delete this check-in?')}
        description={t(
          'checkIn.deleteCheckinDescription',
          'This removes the check-in and its journal entry.'
        )}
        variant="destructive"
        confirmLabel={t('common.delete', 'Delete')}
      />
    </div>
  );
};
