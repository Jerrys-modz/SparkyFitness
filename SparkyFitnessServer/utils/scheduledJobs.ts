/**
 * Whether this instance leaves scheduled jobs to another instance.
 *
 * Jobs start in only two places: scheduleBackgroundJobs() at startup and
 * rescheduleBackups() when an admin changes the backup schedule. With jobs
 * disabled here, a backup schedule change reaches the jobs instance when it
 * restarts. Pushing it sooner (polling the settings, or LISTEN/NOTIFY) would
 * add work or a held connection to every install, including single-container
 * ones.
 */
export function scheduledJobsDisabled(): boolean {
  return process.env.SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS === 'true';
}
