import { useTranslation } from 'react-i18next';
import {
  CHECKIN_COACH_IDS,
  COACH_CHECKINS_MAX_PER_DAY,
  findBuiltinCoach,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCoachCheckinSettings } from '@/hooks/AI/useCoachCheckins';
import { BUILTIN_COACH_LABELS } from '@/utils/builtinCoachLabels';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * Coach check-ins (#2013): let chosen built-in coaches leave a short message
 * when the rules find something worth saying. Off until switched on.
 */
export function CoachCheckinSettings() {
  const { t } = useTranslation();
  const { settings, save, checkNow } = useCoachCheckinSettings();
  const current = settings.data;
  const locked = !current || save.isPending;

  const toggleCoach = (coachId: string, on: boolean) => {
    if (!current) return;
    const without = current.coach_ids.filter((id) => id !== coachId);
    save.mutate({
      // Keep the canonical order whatever order they were switched on in.
      coach_ids: CHECKIN_COACH_IDS.filter(
        (id) => without.includes(id) || (on && id === coachId)
      ),
    });
  };

  return (
    <section
      className="space-y-4 rounded-lg border p-4"
      aria-label={t('coachCheckins.title', 'Coach check-ins')}
    >
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="coach-checkins-enabled">
          {t('coachCheckins.title', 'Coach check-ins')}
        </Label>
        <Switch
          id="coach-checkins-enabled"
          checked={current?.enabled ?? false}
          disabled={locked}
          onCheckedChange={(enabled) => save.mutate({ enabled })}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {t('coachCheckins.help', {
          defaultValue:
            'Once a day your coaches look at your finished days and leave a short message on the Diary when something is worth saying, at most {{max}} a day. They stay quiet otherwise. This applies on web and mobile.',
          max: COACH_CHECKINS_MAX_PER_DAY,
        })}
      </p>

      {(settings.error || save.error || checkNow.error) && (
        <p role="alert" className="text-sm text-destructive">
          {t(
            'coachCheckins.saveFailed',
            'Could not load or save the check-in settings. Try again.'
          )}
        </p>
      )}

      {current?.enabled && (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {t('coachCheckins.coaches', 'Coaches that may check in')}
            </p>
            {CHECKIN_COACH_IDS.map((coachId) => {
              const coach = findBuiltinCoach(coachId);
              if (!coach) return null;
              const labels = BUILTIN_COACH_LABELS[coach.key];
              const name = t(labels.name[0], labels.name[1]);
              return (
                <div
                  key={coachId}
                  className="flex items-center justify-between gap-4"
                >
                  <Label htmlFor={`coach-checkin-${coach.key}`}>{name}</Label>
                  <Switch
                    id={`coach-checkin-${coach.key}`}
                    checked={current.coach_ids.includes(coachId)}
                    disabled={locked}
                    onCheckedChange={(on) => toggleCoach(coachId, on)}
                  />
                </div>
              );
            })}
          </div>

          <div className="space-y-1">
            <Label htmlFor="coach-checkin-hour">
              {t('coachCheckins.hour', 'Check in from')}
            </Label>
            <Select
              value={String(current.checkin_hour)}
              disabled={locked}
              onValueChange={(value) =>
                save.mutate({ checkin_hour: Number(value) })
              }
            >
              <SelectTrigger id="coach-checkin-hour" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((hour) => (
                  <SelectItem key={hour} value={String(hour)}>
                    {`${String(hour).padStart(2, '0')}:00`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="coach-checkin-ai-wording">
              {t('coachCheckins.aiWording', 'Let my AI service word them')}
            </Label>
            <Switch
              id="coach-checkin-ai-wording"
              checked={current.ai_wording}
              disabled={locked}
              onCheckedChange={(ai_wording) => save.mutate({ ai_wording })}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              'coachCheckins.aiWordingHint',
              'Off: messages use ready-made sentences and no AI request is made. On: each message is one request to your AI service, made in the background, and it respects what Sparky remembers.'
            )}
          </p>

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={checkNow.isPending || current.coach_ids.length === 0}
              onClick={() => checkNow.mutate()}
            >
              {t('coachCheckins.checkNow', 'Check now')}
            </Button>
            {checkNow.data && (
              <span className="text-sm text-muted-foreground" role="status">
                {checkNow.data.created > 0
                  ? t('coachCheckins.checkNowCreated', {
                      defaultValue: '{{count}} new message on the Diary.',
                      defaultValue_other:
                        '{{count}} new messages on the Diary.',
                      count: checkNow.data.created,
                    })
                  : t(
                      'coachCheckins.checkNowNone',
                      'Nothing to say right now.'
                    )}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
