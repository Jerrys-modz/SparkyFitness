import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon, GraduationCapIcon } from 'lucide-react';
import { BUILTIN_COACHES } from '@workspace/shared';
import { TooltipIconButton } from '@/components/tooltip-icon-button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCoaches } from '@/hooks/AI/useCoaches';
import { BUILTIN_COACH_LABELS } from '@/utils/builtinCoachLabels';
import {
  setSelectedCoachId,
  useSelectedCoachId,
} from '@/utils/chatCoachSelection';

interface CoachOption {
  id: string | null;
  name: string;
  description: string | null;
}

/**
 * Coach picker in the chat composer (#2013). One coach at a time: the choice
 * adds that coach's instructions to the chat and limits it to the coach's
 * tools. "Sparky" is the assistant with no coach.
 */
export const ChatCoachSelector: FC = () => {
  const { t } = useTranslation();
  const selectedId = useSelectedCoachId();
  const { coaches } = useCoaches();

  const options: CoachOption[] = [
    {
      id: null,
      name: t('coaches.sparky.name', 'Sparky'),
      description: t(
        'coaches.sparky.description',
        'The general assistant, with every tool.'
      ),
    },
    ...BUILTIN_COACHES.map((coach) => {
      const labels = BUILTIN_COACH_LABELS[coach.key];
      return {
        id: coach.id,
        name: t(labels.name[0], labels.name[1]),
        description: t(labels.description[0], labels.description[1]),
      };
    }),
    ...(coaches.data ?? []).map((coach) => ({
      id: coach.id,
      name: coach.name,
      description: coach.description,
    })),
  ];
  // A coach deleted elsewhere reads as Sparky, which is what the server does.
  const active = options.find((option) => option.id === selectedId);
  const label = t('coaches.picker.tooltip', 'Choose a coach');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <TooltipIconButton
          tooltip={label}
          side="top"
          type="button"
          variant="ghost"
          size="icon"
          className="relative size-8"
          aria-label={label}
        >
          <GraduationCapIcon className="size-4" />
          {active?.id && (
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500" />
          )}
        </TooltipIconButton>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80">
        <p className="text-sm font-medium">
          {t('coaches.picker.title', 'Coach')}
        </p>
        <p className="text-muted-foreground mb-2 text-xs">
          {t(
            'coaches.picker.description',
            'A coach gives Sparky a focus and only the tools it needs. Add your own in Settings > AI Service.'
          )}
        </p>
        <div
          role="radiogroup"
          aria-label={label}
          className="flex max-h-72 flex-col gap-1 overflow-auto"
        >
          {options.map((option) => {
            const checked = (active?.id ?? null) === option.id;
            return (
              <button
                key={option.id ?? 'sparky'}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => setSelectedCoachId(option.id)}
                className="hover:bg-accent flex items-start gap-2 rounded px-2 py-1.5 text-left"
              >
                <CheckIcon
                  className={`mt-0.5 size-4 shrink-0 ${checked ? '' : 'invisible'}`}
                />
                <span>
                  <span className="block text-sm">{option.name}</span>
                  {option.description && (
                    <span className="text-muted-foreground block text-xs">
                      {option.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
