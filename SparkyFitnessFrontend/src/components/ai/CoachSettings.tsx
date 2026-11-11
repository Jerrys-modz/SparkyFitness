import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CHAT_TOOL_CATEGORY_SLUGS,
  COACH_DESCRIPTION_MAX_LENGTH,
  COACH_NAME_MAX_LENGTH,
  COACH_PROMPT_MAX_LENGTH,
  CUSTOM_COACHES_MAX,
  type ChatToolCategorySlug,
  type CoachResponse,
} from '@workspace/shared';
import { CATEGORY_LABELS } from '@/utils/chatToolCategoryLabels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { useCoaches } from '@/hooks/AI/useCoaches';

interface Draft {
  /** The coach being changed, or null for a new one. */
  id: string | null;
  name: string;
  description: string;
  prompt: string;
  categories: ChatToolCategorySlug[];
}

const emptyDraft: Draft = {
  id: null,
  name: '',
  description: '',
  prompt: '',
  categories: ['food', 'exercise'],
};

/**
 * The person's own coaches (#2013): create, change and delete them. A coach is
 * picked in the chat composer; the built-in ones need no setup.
 */
export function CoachSettings() {
  const { t } = useTranslation();
  const { coaches, mutation } = useCoaches();
  const [draft, setDraft] = useState<Draft | null>(null);
  const saved = coaches.data ?? [];
  const atLimit = saved.length >= CUSTOM_COACHES_MAX;

  const edit = (coach: CoachResponse) =>
    setDraft({
      id: coach.id,
      name: coach.name,
      description: coach.description ?? '',
      prompt: coach.system_prompt,
      categories: [...coach.tool_categories],
    });

  const toggleCategory = (slug: ChatToolCategorySlug) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            categories: current.categories.includes(slug)
              ? current.categories.filter((item) => item !== slug)
              : [...current.categories, slug],
          }
        : current
    );

  const canSave =
    !!draft &&
    !!draft.name.trim() &&
    !!draft.prompt.trim() &&
    draft.categories.length > 0;

  const save = () => {
    if (!draft || !canSave) return;
    const body = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      system_prompt: draft.prompt.trim(),
      // Keep the canonical order whatever order they were toggled in.
      tool_categories: CHAT_TOOL_CATEGORY_SLUGS.filter((slug) =>
        draft.categories.includes(slug)
      ),
    };
    mutation.mutate(
      draft.id
        ? { action: 'update', id: draft.id, body }
        : { action: 'create', body },
      { onSuccess: () => setDraft(null) }
    );
  };

  return (
    <section
      className="space-y-4 rounded-lg border p-4"
      aria-label={t('coaches.settings.title', 'Your coaches')}
    >
      <div>
        <h3 className="font-medium">
          {t('coaches.settings.title', 'Your coaches')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            'coaches.settings.help',
            'A coach is Sparky with a focus: your instructions plus the only tools it may use. Pick one with the coach button in the chat. The built-in coaches are always there; add your own here. Coaches are private to you.'
          )}
        </p>
      </div>

      {(coaches.error || mutation.error) && (
        <p role="alert" className="text-sm text-destructive">
          {t(
            'coaches.settings.saveFailed',
            'Could not load or save your coaches. Try again.'
          )}
        </p>
      )}

      {saved.map((coach) => (
        <div key={coach.id} className="space-y-1 rounded border p-3">
          <strong>{coach.name}</strong>
          {coach.description && (
            <p className="text-sm text-muted-foreground">{coach.description}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => edit(coach)}
            >
              {t('common.edit', 'Edit')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({ action: 'delete', id: coach.id })
              }
            >
              {t('common.delete', 'Delete')}
            </Button>
          </div>
        </div>
      ))}

      {draft ? (
        <div className="space-y-3 rounded border p-3">
          <div className="space-y-1">
            <Label htmlFor="coach-name">
              {t('coaches.settings.name', 'Name')}
            </Label>
            <Input
              id="coach-name"
              value={draft.name}
              maxLength={COACH_NAME_MAX_LENGTH}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="coach-description">
              {t(
                'coaches.settings.description',
                'Short description (optional)'
              )}
            </Label>
            <Input
              id="coach-description"
              value={draft.description}
              maxLength={COACH_DESCRIPTION_MAX_LENGTH}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="coach-prompt">
              {t('coaches.settings.prompt', 'Instructions')}
            </Label>
            <Textarea
              id="coach-prompt"
              rows={5}
              value={draft.prompt}
              maxLength={COACH_PROMPT_MAX_LENGTH}
              placeholder={t(
                'coaches.settings.promptPlaceholder',
                'What should this coach focus on, and how should it talk to you?'
              )}
              onChange={(event) =>
                setDraft({ ...draft, prompt: event.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {t('coaches.settings.tools', 'Tools this coach may use')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CHAT_TOOL_CATEGORY_SLUGS.map((slug) => {
                const [key, fallback] = CATEGORY_LABELS[slug];
                return (
                  <Toggle
                    key={slug}
                    size="sm"
                    variant="outline"
                    pressed={draft.categories.includes(slug)}
                    onPressedChange={() => toggleCategory(slug)}
                  >
                    {t(key, fallback)}
                  </Toggle>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                'coaches.settings.toolsHint',
                'The coach cannot read or change anything outside these.'
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={mutation.isPending || !canSave}
              onClick={save}
            >
              {t('common.save', 'Save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={atLimit}
          onClick={() => setDraft(emptyDraft)}
        >
          {t('coaches.settings.add', 'Add a coach')}
        </Button>
      )}
      {atLimit && !draft && (
        <p className="text-xs text-muted-foreground">
          {t('coaches.settings.limit', 'You have the most coaches allowed.')}
        </p>
      )}
    </section>
  );
}
