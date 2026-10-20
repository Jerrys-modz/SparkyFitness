import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import moodRoutes from '../routes/moodRoutes.js';
import moodRepository from '../models/moodRepository.js';

vi.mock('../models/moodRepository.js');

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: vi.fn((req, res, next) => {
    req.userId = 'testUserId';
    next();
  }),
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

const app = express();
app.use(express.json());
app.use('/mood', moodRoutes);

const storedValue = () =>
  vi.mocked(moodRepository.createOrUpdateMoodEntry).mock.calls[0]![1];

describe('Mood Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(moodRepository.createOrUpdateMoodEntry).mockResolvedValue({
      id: 'mood-1',
    } as never);
  });

  describe('POST /mood', () => {
    it('stores a value already inside the scale untouched', async () => {
      await request(app)
        .post('/mood')
        .send({ mood_value: 70, entry_date: '2026-06-01' })
        .expect(201);

      expect(storedValue()).toBe(70);
    });

    // This route was the one path to the column that checked neither the type
    // nor the range, which is how values below the scale got in: before #2495
    // the check-in picker wrote the raw band midpoint, 8 for Sad.
    it('brings a value below the scale up to its minimum', async () => {
      await request(app)
        .post('/mood')
        .send({ mood_value: 8, entry_date: '2026-06-01' })
        .expect(201);

      // 8 and 10 are both Sad, so the day keeps the mood it meant.
      expect(storedValue()).toBe(10);
    });

    it('brings a value above the scale down to its maximum', async () => {
      await request(app)
        .post('/mood')
        .send({ mood_value: 140, entry_date: '2026-06-01' })
        .expect(201);

      expect(storedValue()).toBe(100);
    });

    it('rounds to what the integer column can hold', async () => {
      await request(app)
        .post('/mood')
        .send({ mood_value: 62.4, entry_date: '2026-06-01' })
        .expect(201);

      expect(storedValue()).toBe(62);
    });

    it('rejects a value that is not a number rather than letting the column fail', async () => {
      const res = await request(app)
        .post('/mood')
        .send({ mood_value: 'great', entry_date: '2026-06-01' })
        .expect(400);

      // The column name must not reach the response; that is what the existing
      // required-field guard above it exists to prevent.
      expect(res.body.message).toBe('Mood value must be a number.');
      expect(JSON.stringify(res.body)).not.toContain('mood_entries');
      expect(moodRepository.createOrUpdateMoodEntry).not.toHaveBeenCalled();
    });

    it('still requires the field to be present at all', async () => {
      await request(app)
        .post('/mood')
        .send({ entry_date: '2026-06-01' })
        .expect(400);

      expect(moodRepository.createOrUpdateMoodEntry).not.toHaveBeenCalled();
    });

    describe('energy and focus', () => {
      const ratingsArg = () =>
        vi.mocked(moodRepository.createOrUpdateMoodEntry).mock.calls[0]![5];

      it('passes energy and focus through', async () => {
        await request(app)
          .post('/mood')
          .send({
            mood_value: 70,
            entry_date: '2026-10-20',
            energy_value: 4,
            focus_value: 2,
          })
          .expect(201);

        expect(ratingsArg()).toStrictEqual({ energyValue: 4, focusValue: 2 });
      });

      it('leaves ratings an older client never sent for the repository to keep', async () => {
        await request(app)
          .post('/mood')
          .send({ mood_value: 70, entry_date: '2026-10-20' })
          .expect(201);

        expect(ratingsArg()).toStrictEqual({
          energyValue: undefined,
          focusValue: undefined,
        });
      });

      it('forwards an explicit null so a cleared rating is cleared', async () => {
        await request(app)
          .post('/mood')
          .send({
            mood_value: 70,
            entry_date: '2026-10-20',
            energy_value: null,
          })
          .expect(201);

        expect(ratingsArg()).toStrictEqual({
          energyValue: null,
          focusValue: undefined,
        });
      });

      it.each([0, 6, 2.5, '4'])(
        'rejects energy %p before touching the database',
        async (bad) => {
          const res = await request(app)
            .post('/mood')
            .send({
              mood_value: 70,
              entry_date: '2026-10-20',
              energy_value: bad,
            })
            .expect(400);

          expect(res.body.message).toBe(
            'Energy and focus must be whole numbers from 1 to 5.'
          );
          expect(moodRepository.createOrUpdateMoodEntry).not.toHaveBeenCalled();
        }
      );
    });
  });

  describe('PUT /mood/:id', () => {
    beforeEach(() => {
      vi.mocked(moodRepository.updateMoodEntry).mockResolvedValue({
        id: 'mood-1',
      } as never);
    });

    it('clamps a supplied value the same way', async () => {
      await request(app)
        .put('/mood/mood-1')
        .send({ mood_value: 8 })
        .expect(200);

      expect(vi.mocked(moodRepository.updateMoodEntry).mock.calls[0]![2]).toBe(
        10
      );
    });

    it('leaves an omitted value for the update to keep', async () => {
      await request(app)
        .put('/mood/mood-1')
        .send({ notes: 'just a note' })
        .expect(200);

      // null is what the UPDATE's COALESCE reads as "keep what is there".
      expect(
        vi.mocked(moodRepository.updateMoodEntry).mock.calls[0]![2]
      ).toBeNull();
    });

    it('passes only the rating that was sent', async () => {
      await request(app)
        .put('/mood/mood-1')
        .send({ focus_value: 5 })
        .expect(200);

      expect(
        vi.mocked(moodRepository.updateMoodEntry).mock.calls[0]![5]
      ).toStrictEqual({ energyValue: undefined, focusValue: 5 });
    });

    it('rejects an out-of-range rating', async () => {
      const res = await request(app)
        .put('/mood/mood-1')
        .send({ focus_value: 9 })
        .expect(400);

      expect(res.body.message).toBe(
        'Energy and focus must be whole numbers from 1 to 5.'
      );
      expect(moodRepository.updateMoodEntry).not.toHaveBeenCalled();
    });
  });
});
