import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import MoodMeter from './MoodMeter';
import HomeDashboardFasting from './HomeDashboardFasting';
import { useTranslation } from 'react-i18next';

interface CheckInTopRowProps {
  mood: number;
  moodNotes: string;
  moodTags: string[];
  energy: number | null;
  focus: number | null;
  setMood: (value: number) => void;
  setMoodNotes: (value: string) => void;
  setMoodTags: (value: string[]) => void;
  setEnergy: (value: number | null) => void;
  setFocus: (value: number | null) => void;
  onSaveMood: (e: React.FormEvent) => Promise<void>;
  isSavingMood: boolean;
}

export const CheckInTopRow = ({
  mood,
  moodNotes,
  moodTags,
  energy,
  focus,
  setMood,
  setMoodNotes,
  setMoodTags,
  setEnergy,
  setFocus,
  onSaveMood,
  isSavingMood,
}: CheckInTopRowProps) => {
  const { t } = useTranslation();

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div className="w-full h-full">
          <HomeDashboardFasting />
        </div>

        <div className="w-full h-full">
          <Card>
            <CardHeader>
              <CardTitle>
                {t(
                  'checkIn.howAreYouFeelingToday',
                  'How are you feeling today?'
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSaveMood} className="space-y-4">
                <MoodMeter
                  mood={mood}
                  notes={moodNotes}
                  moodTags={moodTags}
                  energy={energy}
                  focus={focus}
                  onMoodChange={setMood}
                  onNotesChange={setMoodNotes}
                  onTagsChange={setMoodTags}
                  onEnergyChange={setEnergy}
                  onFocusChange={setFocus}
                />
                <div className="flex justify-center pt-2">
                  <Button type="submit" disabled={isSavingMood} size="sm">
                    {isSavingMood
                      ? t('checkIn.saving', 'Saving...')
                      : t('checkIn.saveMood', 'Save Mood')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};
