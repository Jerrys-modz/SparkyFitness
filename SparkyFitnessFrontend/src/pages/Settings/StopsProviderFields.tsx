import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';

interface StopsProviderFieldsProps {
  baseUrl: string | null | undefined;
  onBaseUrlChange: (value: string) => void;
  idPrefix: string;
}

/**
 * The field of an Overpass stops provider: the API URL, left empty on
 * purpose, and what the public instance is and is not good for.
 */
export const StopsProviderFields = ({
  baseUrl,
  onBaseUrlChange,
  idPrefix,
}: StopsProviderFieldsProps) => {
  const { t } = useTranslation();
  return (
    <>
      <div>
        <Label htmlFor={`${idPrefix}_stops_base_url`}>
          {t('settings.stopsProvider.baseUrlLabel', 'Overpass API URL')}
        </Label>
        <Input
          id={`${idPrefix}_stops_base_url`}
          type="text"
          value={baseUrl || ''}
          onChange={(e) => onBaseUrlChange(e.target.value)}
          placeholder={t(
            'settings.stopsProvider.baseUrlPlaceholder',
            'https://your-overpass-server/api/interpreter'
          )}
          autoComplete="off"
        />
      </div>
      <div className="text-sm text-muted-foreground col-span-2 space-y-1">
        <p>
          {t(
            'settings.stopsProvider.privacyNote',
            'To show water, toilets, cafes and viewpoints along a route, the area around that route (a corridor along its line) is sent to this server, which can see it. Use a server you trust, or run your own.'
          )}
        </p>
        <p>
          {t(
            'settings.stopsProvider.publicServerNote',
            'Nothing is filled in for you. The public Overpass instance (overpass-api.de) is for light, personal use only. Its documentation asks users to stay under about 10,000 requests and 1 GB of downloads a day, and every user of this server counts toward that. For several people or regular use, host your own Overpass server or use a private or paid one.'
          )}
        </p>
        <p>
          {t(
            'settings.stopsProvider.unlockNote',
            'Once this provider is active, stops along a route become available in the mobile app. Answers are kept for days, lookups run one at a time, and a busy server is left alone for 30 seconds.'
          )}
        </p>
      </div>
    </>
  );
};
