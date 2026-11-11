import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import {
  BUILTIN_COACHES,
  CHAT_TOOL_CATEGORY_SLUGS,
  createCoachBodySchema,
  updateCoachBodySchema,
} from '@workspace/shared';
import errorHandler from '../middleware/errorHandler.js';
import coachRoutes from '../routes/v2/coachRoutes.js';
import * as repository from '../models/customCoachRepository.js';
import {
  buildCoachPromptSection,
  coachToolCategories,
  resolveChatCoach,
  resolveCoachThreadId,
} from '../services/coachPersonaService.js';

vi.mock('../models/customCoachRepository.js', () => {
  class CoachLimitError extends Error {}
  return {
    CoachLimitError,
    listCoaches: vi.fn(),
    getCoach: vi.fn(),
    createCoach: vi.fn(),
    updateCoach: vi.fn(),
    deleteCoach: vi.fn(),
  };
});
vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.authenticatedUserId = 'actor';
    // A switched context: the routes must still act for the signed-in person.
    req.userId = 'family-member';
    next();
  },
}));

const COACH_ID = 'd3ebfc08-7f2e-4736-8b08-b8a0cbac2d17';
const stored = {
  id: COACH_ID,
  name: 'Marathon coach',
  description: null,
  system_prompt: 'Focus on my marathon build.',
  tool_categories: ['exercise' as const, 'reports' as const],
  created_at: '2026-11-11T00:00:00.000Z',
  updated_at: '2026-11-11T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('built-in coaches', () => {
  it('have unique ids and only known tool categories', () => {
    const ids = BUILTIN_COACHES.map((coach) => coach.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const coach of BUILTIN_COACHES) {
      expect(coach.id).toBe(`builtin:${coach.key}`);
      expect(coach.prompt.length).toBeGreaterThan(50);
      expect(coach.toolCategories.length).toBeGreaterThan(0);
      for (const slug of coach.toolCategories) {
        expect(CHAT_TOOL_CATEGORY_SLUGS).toContain(slug);
      }
    }
  });
});

describe('resolveChatCoach', () => {
  it('returns no coach when none was sent', async () => {
    expect(await resolveChatCoach('actor', undefined)).toBeNull();
    expect(await resolveChatCoach('actor', '')).toBeNull();
    expect(await resolveChatCoach('actor', 42)).toBeNull();
  });

  it('resolves a built-in coach without touching the database', async () => {
    const coach = await resolveChatCoach('actor', 'builtin:recovery');
    expect(coach?.name).toBe('Recovery Coach');
    expect(coach?.toolCategories).toContain('exercise');
    expect(repository.getCoach).not.toHaveBeenCalled();
  });

  it('ignores an unknown built-in and a malformed id', async () => {
    expect(await resolveChatCoach('actor', 'builtin:nope')).toBeNull();
    expect(
      await resolveChatCoach('actor', "x'; DROP TABLE coaches")
    ).toBeNull();
    expect(repository.getCoach).not.toHaveBeenCalled();
  });

  it("loads the person's own coach", async () => {
    vi.mocked(repository.getCoach).mockResolvedValue(stored);
    const coach = await resolveChatCoach('actor', COACH_ID);
    expect(repository.getCoach).toHaveBeenCalledWith('actor', COACH_ID);
    expect(coach).toMatchObject({
      name: 'Marathon coach',
      prompt: 'Focus on my marathon build.',
      toolCategories: ['exercise', 'reports'],
    });
  });

  it('falls back to no coach when it is gone or cannot be loaded', async () => {
    vi.mocked(repository.getCoach).mockResolvedValue(null);
    expect(await resolveChatCoach('actor', COACH_ID)).toBeNull();
    vi.mocked(repository.getCoach).mockRejectedValue(new Error('db down'));
    expect(await resolveChatCoach('actor', COACH_ID)).toBeNull();
  });
});

describe('resolveCoachThreadId', () => {
  it('names a built-in or own coach thread, and Sparky for anything else', async () => {
    expect(await resolveCoachThreadId('actor', 'builtin:recovery')).toBe(
      'builtin:recovery'
    );
    vi.mocked(repository.getCoach).mockResolvedValue(stored);
    expect(await resolveCoachThreadId('actor', COACH_ID)).toBe(COACH_ID);

    vi.mocked(repository.getCoach).mockResolvedValue(null);
    expect(await resolveCoachThreadId('actor', COACH_ID)).toBeNull();
    expect(await resolveCoachThreadId('actor', undefined)).toBeNull();
    expect(
      await resolveCoachThreadId('actor', ['builtin:recovery'])
    ).toBeNull();
  });
});

describe('coachToolCategories', () => {
  const coach = {
    id: 'c',
    name: 'C',
    prompt: 'p',
    toolCategories: ['food' as const, 'exercise' as const],
  };

  it("uses the coach's list when the person selected nothing", () => {
    expect(coachToolCategories(coach)).toEqual(['food', 'exercise']);
    expect(coachToolCategories(coach, [])).toEqual(['food', 'exercise']);
  });

  it('lets a selection narrow the list but never widen it', () => {
    expect(coachToolCategories(coach, ['food', 'medications'])).toEqual([
      'food',
    ]);
  });

  it("keeps the coach's list when the selection shares nothing with it", () => {
    expect(coachToolCategories(coach, ['medications'])).toEqual([
      'food',
      'exercise',
    ]);
  });
});

describe('buildCoachPromptSection', () => {
  it('names the role on one line and keeps the tool rules in force', () => {
    const section = buildCoachPromptSection({
      id: 'c',
      name: 'Night\nowl  coach',
      prompt: '  Be brief.  ',
      toolCategories: ['food'],
    });
    const lines = section.split('\n');
    expect(lines[0]).toBe('## Your role in this conversation: Night owl coach');
    expect(section).toContain('never changes the tool-use rules');
    expect(lines.at(-1)).toBe('Be brief.');
  });
});

describe('coach contracts', () => {
  const valid = {
    name: 'Marathon coach',
    system_prompt: 'Focus on my marathon build.',
    tool_categories: ['exercise'],
  };

  it('accept a valid coach and reject bad ones', () => {
    expect(createCoachBodySchema.safeParse(valid).success).toBe(true);
    for (const bad of [
      { ...valid, name: '  ' },
      { ...valid, system_prompt: 'x'.repeat(4001) },
      { ...valid, tool_categories: [] },
      { ...valid, tool_categories: ['everything'] },
      { ...valid, tool_categories: ['food', 'food'] },
      { ...valid, user_id: 'someone-else' },
    ]) {
      expect(createCoachBodySchema.safeParse(bad).success).toBe(false);
    }
  });

  it('need at least one field to change', () => {
    expect(updateCoachBodySchema.safeParse({}).success).toBe(false);
    expect(updateCoachBodySchema.safeParse({ name: 'New' }).success).toBe(true);
    expect(updateCoachBodySchema.safeParse({ description: null }).success).toBe(
      true
    );
  });
});

describe('/api/v2/coaches', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v2/coaches', coachRoutes);
  app.use(errorHandler);

  it('lists the signed-in person’s coaches even in a switched context', async () => {
    vi.mocked(repository.listCoaches).mockResolvedValue([stored]);
    const res = await request(app).get('/api/v2/coaches');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([stored]);
    expect(repository.listCoaches).toHaveBeenCalledWith('actor');
  });

  it('creates a coach', async () => {
    vi.mocked(repository.createCoach).mockResolvedValue(stored);
    const res = await request(app)
      .post('/api/v2/coaches')
      .send({
        name: ' Marathon coach ',
        system_prompt: 'Focus on my marathon build.',
        tool_categories: ['exercise', 'reports'],
      });
    expect(res.status).toBe(201);
    expect(repository.createCoach).toHaveBeenCalledWith(
      'actor',
      expect.objectContaining({ name: 'Marathon coach' })
    );
  });

  it('rejects an invalid coach', async () => {
    const res = await request(app)
      .post('/api/v2/coaches')
      .send({ name: 'x', system_prompt: 'y', tool_categories: ['nope'] });
    expect(res.status).toBe(400);
    expect(repository.createCoach).not.toHaveBeenCalled();
  });

  it('answers 409 at the limit', async () => {
    vi.mocked(repository.createCoach).mockRejectedValue(
      new repository.CoachLimitError()
    );
    const res = await request(app)
      .post('/api/v2/coaches')
      .send({ name: 'x', system_prompt: 'y', tool_categories: ['food'] });
    expect(res.status).toBe(409);
  });

  it('changes and deletes a coach, and answers 404 for one that is not there', async () => {
    vi.mocked(repository.updateCoach).mockResolvedValue(stored);
    const patched = await request(app)
      .patch(`/api/v2/coaches/${COACH_ID}`)
      .send({ name: 'Renamed' });
    expect(patched.status).toBe(200);

    vi.mocked(repository.updateCoach).mockResolvedValue(null);
    const missing = await request(app)
      .patch(`/api/v2/coaches/${COACH_ID}`)
      .send({ name: 'Renamed' });
    expect(missing.status).toBe(404);

    const notUuid = await request(app).delete('/api/v2/coaches/not-a-uuid');
    expect(notUuid.status).toBe(404);
    expect(repository.deleteCoach).not.toHaveBeenCalled();

    vi.mocked(repository.deleteCoach).mockResolvedValue(true);
    const deleted = await request(app).delete(`/api/v2/coaches/${COACH_ID}`);
    expect(deleted.status).toBe(204);
  });
});
