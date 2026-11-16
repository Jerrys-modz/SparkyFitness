import { useEffect, useState } from 'react';

import i18n from '../localization/i18n';

/**
 * A number that goes up on every app language change, for effects that bake
 * translated text into something outside React (scheduled notifications).
 */
export function useLanguageRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const onLanguageChanged = () => setRevision((value) => value + 1);
    i18n.on('languageChanged', onLanguageChanged);
    return () => i18n.off('languageChanged', onLanguageChanged);
  }, []);
  return revision;
}
