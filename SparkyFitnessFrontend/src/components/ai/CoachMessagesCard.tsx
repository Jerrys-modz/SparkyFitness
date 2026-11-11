import { GraduationCapIcon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useChatbotVisibility } from '@/contexts/ChatbotVisibilityContext';
import { useCoachMessages } from '@/hooks/AI/useCoachCheckins';
import { setSelectedCoachId } from '@/utils/chatCoachSelection';
import {
  coachMessageCoachName,
  coachMessageText,
} from '@/utils/coachMessageText';

// The Diary shows the newest few; older ones are still listed by the API.
const MAX_SHOWN = 3;

/**
 * What the person's coaches left for them (#2013). Renders nothing when there
 * is no message, which is always the case until check-ins are switched on.
 */
export function CoachMessagesCard() {
  const { t } = useTranslation();
  const { openChat } = useChatbotVisibility();
  const { messages, dismiss } = useCoachMessages();
  const shown = (messages.data ?? []).slice(0, MAX_SHOWN);
  if (shown.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCapIcon className="h-4 w-4" />
          {t('coachMessages.title', 'From your coaches')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {shown.map((message) => {
          const coachName = coachMessageCoachName(message, t);
          return (
            <div
              key={message.id}
              className="flex items-start justify-between gap-3"
            >
              <div>
                <p className="text-sm font-medium">{coachName}</p>
                <p className="text-sm">{coachMessageText(message, t)}</p>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => {
                    setSelectedCoachId(message.coach_id);
                    openChat();
                  }}
                >
                  {t('coachMessages.talk', 'Talk to this coach')}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={dismiss.isPending}
                onClick={() => dismiss.mutate(message.id)}
                aria-label={t('coachMessages.dismiss', 'Dismiss')}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
