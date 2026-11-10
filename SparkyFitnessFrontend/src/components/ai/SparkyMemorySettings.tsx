import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  assistantPreferenceKey,
  assistantPreferenceLabel,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSavedPreferences } from '@/hooks/AI/useSavedPreferences';
import {
  setSparkySummaryCardEnabled,
  useSparkySummaryCardEnabled,
} from '@/utils/sparkySummaryPreference';

interface Props {
  /** `user_preferences.assistant_memory_enabled`; undefined while loading. */
  memoryEnabled: boolean | undefined;
  onMemoryEnabledChange: (enabled: boolean) => void;
  disabled?: boolean;
}

/**
 * What Sparky remembers and the daily summary switch (#2013): turn saved
 * preferences on or off, add, change or delete them, and choose whether the
 * Diary shows the daily summary in this browser.
 */
export function SparkyMemorySettings({
  memoryEnabled,
  onMemoryEnabledChange,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const summaryEnabled = useSparkySummaryCardEnabled();
  const { preferences, mutation } = useSavedPreferences();
  const [editing, setEditing] = useState<string>();
  const [editValue, setEditValue] = useState('');
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const saved = preferences.data ?? [];

  const add = () => {
    const key = assistantPreferenceKey(newName, Date.now().toString(36));
    const existing = saved.find((preference) => preference.key === key);
    mutation.mutate(
      {
        action: 'save',
        key,
        value: newValue.trim(),
        expectedVersion: existing?.version ?? 0,
      },
      {
        onSuccess: () => {
          setNewName('');
          setNewValue('');
        },
      }
    );
  };

  return (
    <section
      className="space-y-4 rounded-lg border p-4"
      aria-label={t('sparkyMemory.title', 'What Sparky remembers')}
    >
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="sparky-summary-enabled">
          {t('sparkyMemory.summarySwitch', 'Daily summary on the Diary')}
        </Label>
        <Switch
          id="sparky-summary-enabled"
          checked={summaryEnabled}
          onCheckedChange={setSparkySummaryCardEnabled}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {t(
          'sparkyMemory.summaryHint',
          'Shows a short AI summary of your day with one or two suggestions at the top of the Diary. It uses your AI service once when you open the Diary, and this switch applies to this browser only.'
        )}
      </p>

      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="sparky-memory-enabled">
          {t('sparkyMemory.enable', 'Let Sparky use what it remembers')}
        </Label>
        <Switch
          id="sparky-memory-enabled"
          checked={memoryEnabled !== false}
          disabled={disabled || memoryEnabled === undefined}
          onCheckedChange={onMemoryEnabledChange}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {t(
          'sparkyMemory.help',
          'Things you told Sparky to keep in mind, such as your diet, allergies, foods you avoid, goals or how you like to be coached. Sparky keeps to these in chat and in the daily summary, on web and mobile. This is what you said, kept apart from what you log, private to you and never shared with family. Turning this off keeps the list but Sparky stops reading and adding to it.'
        )}
      </p>

      {(preferences.error || mutation.error) && (
        <p role="alert" className="text-sm text-destructive">
          {t(
            'sparkyMemory.saveFailed',
            'Could not load or save. Refresh to read the latest version.'
          )}
        </p>
      )}

      {saved.map((preference) => (
        <div key={preference.key} className="space-y-2 rounded border p-3">
          <strong className="capitalize">
            {assistantPreferenceLabel(preference.key)}
          </strong>
          {editing === preference.key ? (
            <div className="flex gap-2">
              <Input
                aria-label={t('sparkyMemory.valueLabel', 'What to remember')}
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                maxLength={2000}
              />
              <Button
                size="sm"
                disabled={mutation.isPending || !editValue.trim()}
                onClick={() =>
                  mutation.mutate(
                    {
                      action: 'save',
                      key: preference.key,
                      value: editValue.trim(),
                      expectedVersion: preference.version,
                    },
                    { onSuccess: () => setEditing(undefined) }
                  )
                }
              >
                {t('common.save', 'Save')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(undefined)}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm">{preference.value}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={mutation.isPending}
                  onClick={() => {
                    setEditing(preference.key);
                    setEditValue(preference.value);
                  }}
                >
                  {t('common.edit', 'Edit')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ action: 'forget', preference })
                  }
                >
                  {t('common.delete', 'Delete')}
                </Button>
              </div>
            </>
          )}
        </div>
      ))}
      {preferences.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t(
            'sparkyMemory.empty',
            'Nothing saved yet. Add something below, or tell Sparky in chat, for example "Remember that I am vegetarian".'
          )}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="sparky-memory-new-name">
          {t('sparkyMemory.addTitle', 'Add something to remember')}
        </Label>
        <Input
          id="sparky-memory-new-name"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          maxLength={100}
          placeholder={t(
            'sparkyMemory.namePlaceholder',
            'Topic, e.g. Diet or Coaching style'
          )}
        />
        <Input
          aria-label={t('sparkyMemory.valueLabel', 'What to remember')}
          value={newValue}
          onChange={(event) => setNewValue(event.target.value)}
          maxLength={2000}
          placeholder={t(
            'sparkyMemory.valuePlaceholder',
            'e.g. Vegetarian, no mushrooms'
          )}
        />
        <Button
          size="sm"
          disabled={mutation.isPending || !newName.trim() || !newValue.trim()}
          onClick={add}
        >
          {t('sparkyMemory.add', 'Add')}
        </Button>
      </div>
    </section>
  );
}
