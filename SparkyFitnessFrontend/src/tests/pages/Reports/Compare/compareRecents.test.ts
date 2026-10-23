import type { CompareQuestion } from '@workspace/shared';
import {
  loadRecentQuestions,
  saveRecentQuestion,
} from '@/pages/Reports/Compare/compareRecents';

const KEY = 'sparky.compareRecentQuestions.v1';

const Q = (b: CompareQuestion['b']): CompareQuestion => ({
  a: 'timeAsleep',
  b,
  choice: 'sameDay',
});

describe('compareRecents', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => jest.restoreAllMocks());

  test('loadRecentQuestions drops an unknown metric, a sinceHabit choice and non-JSON, and returns [] when localStorage.getItem throws', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify([
        { a: 'timeAsleep', b: 'energy', choice: 'sameDay' },
        { a: 'nonsense', b: 'energy', choice: 'sameDay' },
        { a: 'meditated', b: 'mood', choice: 'sinceHabit' },
      ])
    );
    expect(loadRecentQuestions()).toEqual([Q('energy')]);

    window.localStorage.setItem(KEY, 'not json {');
    expect(loadRecentQuestions()).toEqual([]);

    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadRecentQuestions()).toEqual([]);
  });

  test('saveRecentQuestion keeps the newest five without duplicates', () => {
    const keys = [
      'energy',
      'mood',
      'focus',
      'sleepScore',
      'overnightHrv',
    ] as const;
    keys.forEach((b) => saveRecentQuestion(Q(b)));
    const again = saveRecentQuestion(Q('energy'));
    expect(again.map((q) => q.b)).toEqual([
      'energy',
      'overnightHrv',
      'sleepScore',
      'focus',
      'mood',
    ]);
    const sixth = saveRecentQuestion(Q('restingHeartRate'));
    expect(sixth).toHaveLength(5);
    expect(sixth[0]?.b).toBe('restingHeartRate');
    expect(loadRecentQuestions()).toEqual(sixth);
  });

  test('saveRecentQuestion still returns the list when setItem throws', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(saveRecentQuestion(Q('energy'))).toEqual([Q('energy')]);
  });
});
