import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import chatRoutes from '../routes/chatRoutes.js';
import chatService from '../services/chatService.js';
import { resolveCoachThreadId } from '../services/coachPersonaService.js';

vi.mock('../services/chatService.js', () => ({
  default: {
    getSparkyChatHistory: vi.fn(),
    clearAllSparkyChatHistory: vi.fn(),
  },
}));
vi.mock('../services/coachPersonaService.js', () => ({
  resolveCoachThreadId: vi.fn(),
}));
vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.authenticatedUserId = 'actor';
    req.userId = 'actor';
    next();
  },
}));

const app = express();
app.use(express.json());
app.use('/api/chat', chatRoutes);

describe('chat history threads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chatService.getSparkyChatHistory).mockResolvedValue([]);
    vi.mocked(chatService.clearAllSparkyChatHistory).mockResolvedValue({
      message: 'ok',
    });
  });

  it("reads plain Sparky's thread when no coach is named", async () => {
    vi.mocked(resolveCoachThreadId).mockResolvedValue(null);
    const res = await request(app).get('/api/chat/sparky-chat-history');
    expect(res.status).toBe(200);
    expect(chatService.getSparkyChatHistory).toHaveBeenCalledWith(
      'actor',
      'actor',
      null
    );
  });

  it("reads the named coach's thread", async () => {
    vi.mocked(resolveCoachThreadId).mockResolvedValue('builtin:recovery');
    await request(app).get(
      '/api/chat/sparky-chat-history?coachId=builtin%3Arecovery'
    );
    expect(resolveCoachThreadId).toHaveBeenCalledWith(
      'actor',
      'builtin:recovery'
    );
    expect(chatService.getSparkyChatHistory).toHaveBeenCalledWith(
      'actor',
      'actor',
      'builtin:recovery'
    );
  });

  it('clears only the thread shown when asked to', async () => {
    vi.mocked(resolveCoachThreadId).mockResolvedValue('builtin:recovery');
    await request(app)
      .post('/api/chat/clear-all-history')
      .send({ thread: true, coachId: 'builtin:recovery' });
    expect(chatService.clearAllSparkyChatHistory).toHaveBeenCalledWith(
      'actor',
      { coachId: 'builtin:recovery' }
    );

    vi.mocked(resolveCoachThreadId).mockResolvedValue(null);
    await request(app)
      .post('/api/chat/clear-all-history')
      .send({ thread: true });
    expect(chatService.clearAllSparkyChatHistory).toHaveBeenLastCalledWith(
      'actor',
      { coachId: null }
    );
  });

  it('still clears everything for a client that names no thread', async () => {
    await request(app).post('/api/chat/clear-all-history').send({});
    expect(chatService.clearAllSparkyChatHistory).toHaveBeenCalledWith(
      'actor',
      undefined
    );
    expect(resolveCoachThreadId).not.toHaveBeenCalled();
  });
});
