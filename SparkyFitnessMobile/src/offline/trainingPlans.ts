import {
  fetchCustomRunProgramsFromServer,
  fetchRunProgramFromServer,
} from '../services/api/runProgramApi';
import {
  fetchTrainingCalendarFromServer,
  trainingCalendarCacheKey,
} from '../services/api/reportsApi';
import { monthRange } from '../utils/trainingCalendar';
import { getTodayDate } from '../utils/dateUtils';
import { accountGeneration } from './accountGeneration';
import { putCacheRows } from './cacheStore';
import { CACHE_COLLECTIONS, SINGLE_DOCUMENT_KEY } from './collections';
import type { OfflineDb } from './types';

/** Months of the training calendar kept: the one before, this one and the next. */
const MONTHS_BEFORE = 1;
const MONTHS_AFTER = 1;

/** The `YYYY-MM` of the month `offset` months from `month`. */
function shiftMonth(month: string, offset: number): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const index = year * 12 + (m - 1) + offset;
  const y = Math.floor(index / 12);
  return `${y}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * Keeps the training program, the person's own programs and the training
 * calendar for the months around today, so the Library's Training programs
 * and Training calendar open without a connection. Reading only: changing a
 * program or a plan still needs the server. Each part stands alone, so one
 * failing leaves the others (and its own earlier copy) in place.
 */
export async function refreshTrainingPlans(
  db: OfflineDb,
  serverConfigId: string,
  firstDayOfWeek: number,
  startedUnder: number
): Promise<void> {
  const stillSameAccount = () => accountGeneration() === startedUnder;
  const errors: unknown[] = [];

  try {
    const program = await fetchRunProgramFromServer();
    if (stillSameAccount()) {
      await putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.runProgram, [
        { key: SINGLE_DOCUMENT_KEY, payload: program },
      ]);
    }
  } catch (error) {
    errors.push(error);
  }
  try {
    const custom = await fetchCustomRunProgramsFromServer();
    if (stillSameAccount()) {
      await putCacheRows(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.customRunPrograms,
        [{ key: SINGLE_DOCUMENT_KEY, payload: custom }]
      );
    }
  } catch (error) {
    errors.push(error);
  }

  const thisMonth = getTodayDate().slice(0, 7);
  for (let offset = -MONTHS_BEFORE; offset <= MONTHS_AFTER; offset += 1) {
    const range = monthRange(shiftMonth(thisMonth, offset), firstDayOfWeek);
    try {
      const calendar = await fetchTrainingCalendarFromServer(
        range.start,
        range.end
      );
      if (!stillSameAccount()) return;
      await putCacheRows(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.trainingCalendar,
        [
          {
            key: trainingCalendarCacheKey(range.start, range.end),
            payload: calendar,
          },
        ]
      );
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw errors[0];
}
