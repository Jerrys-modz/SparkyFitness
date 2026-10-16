import type { TFunction } from 'i18next';

export type WhatsNewReleaseGroup = {
  heading: string;
  bullets: string[];
};

export type WhatsNewRelease = {
  /** Matches the app version in package.json for that release. */
  version: string;
  /** Release date as a YYYY-MM-DD calendar day. */
  date: string;
  title: string;
  groups: WhatsNewReleaseGroup[];
};

// Newest release first. When a release ships, add its entry at the top (see
// "What's New release notes" in AGENTS.md). Every string uses a static key with
// an English defaultValue so the i18n audit can read it; only the English
// catalog is edited by hand.
export function getWhatsNewReleases(t: TFunction): WhatsNewRelease[] {
  return [
    {
      version: '1.8.0',
      date: '2026-10-08',
      title: t('whatsNewPage.releases.v1_8_0.title', {
        defaultValue: 'Mindfulness, shortcuts and supplements',
      }),
      groups: [
        {
          heading: t('whatsNewPage.releases.v1_8_0.tracking.heading', {
            defaultValue: 'Tracking',
          }),
          bullets: [
            t('whatsNewPage.releases.v1_8_0.tracking.mindfulness', {
              defaultValue:
                'Log mindfulness sessions, use paced breathing and a meditation timer, and see your practice on the dashboard.',
            }),
            t('whatsNewPage.releases.v1_8_0.tracking.symptoms', {
              defaultValue:
                'Track symptoms with a new dashboard card and see patterns in your history.',
            }),
            t('whatsNewPage.releases.v1_8_0.tracking.fasting', {
              defaultValue:
                'Fasts can now be worked out from your meal logs, with eating window tracking and a richer fasting card on the dashboard.',
            }),
            t('whatsNewPage.releases.v1_8_0.tracking.supplements', {
              defaultValue:
                'Add and edit supplements alongside your medications. Reminders scheduled for the same time now arrive as one notification.',
            }),
            t('whatsNewPage.releases.v1_8_0.tracking.goalLines', {
              defaultValue:
                'Health Trends charts now draw your goal for each day.',
            }),
          ],
        },
        {
          heading: t('whatsNewPage.releases.v1_8_0.workouts.heading', {
            defaultValue: 'Workouts and Apple Watch',
          }),
          bullets: [
            t('whatsNewPage.releases.v1_8_0.workouts.heartRate', {
              defaultValue:
                'See your watch heart rate live during a workout, and the time you spent in each heart-rate zone afterward.',
            }),
            t('whatsNewPage.releases.v1_8_0.workouts.routes', {
              defaultValue: 'Cardio routes are now drawn over a map.',
            }),
            t('whatsNewPage.releases.v1_8_0.workouts.bodyweight', {
              defaultValue:
                'Log bodyweight exercises with added or assisted weight, and check your training consistency over time.',
            }),
            t('whatsNewPage.releases.v1_8_0.workouts.restChime', {
              defaultValue:
                'The rest-timer chime plays even in silent mode, and in the background on iPhone. Your watch buzzes when rest ends.',
            }),
            t('whatsNewPage.releases.v1_8_0.workouts.watch', {
              defaultValue:
                'On Apple Watch, enter weight and reps with the Digital Crown, complete a set with a double-tap, start a saved workout from your wrist, and choose which watch pages to show.',
            }),
          ],
        },
        {
          heading: t('whatsNewPage.releases.v1_8_0.shortcuts.heading', {
            defaultValue: 'Shortcuts and scanning',
          }),
          bullets: [
            t('whatsNewPage.releases.v1_8_0.shortcuts.quickActions', {
              defaultValue:
                'Press and hold the app icon to scan food, log food, log water or manage a fast.',
            }),
            t('whatsNewPage.releases.v1_8_0.shortcuts.siri', {
              defaultValue:
                'Use Siri and Shortcuts to log water, log your weight, and start or end a fast without opening the app.',
            }),
            t('whatsNewPage.releases.v1_8_0.shortcuts.labelScan', {
              defaultValue:
                'On iOS 27, nutrition labels can be read on your device, and the scan shows whether it was read on your device or by the server.',
            }),
          ],
        },
        {
          heading: t('whatsNewPage.releases.v1_8_0.polish.heading', {
            defaultValue: 'Everyday polish',
          }),
          bullets: [
            t('whatsNewPage.releases.v1_8_0.polish.dates', {
              defaultValue:
                'The date bar and header are color-coded for past, current and future days, and Today and Yesterday labels are back.',
            }),
            t('whatsNewPage.releases.v1_8_0.polish.passkeys', {
              defaultValue:
                'Passkey sign-in is hidden when your server has turned passkeys off.',
            }),
          ],
        },
      ],
    },
  ];
}
