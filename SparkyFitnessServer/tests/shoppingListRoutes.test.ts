import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import shoppingListRoutes from '../routes/v2/shoppingListRoutes.js';
import {
  clearCheckedShoppingListItems,
  createShoppingListItem,
  deleteShoppingListItem,
  listShoppingListItems,
  updateShoppingListItem,
} from '../models/shoppingListRepository.js';

vi.mock('../models/shoppingListRepository.js', () => ({
  clearCheckedShoppingListItems: vi.fn(),
  createShoppingListItem: vi.fn(),
  deleteShoppingListItem: vi.fn(),
  listShoppingListItems: vi.fn(),
  updateShoppingListItem: vi.fn(),
}));

let actingAs = 'test-user-id';
const app = express();
app.use(express.json());
app.use(
  (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = actingAs;
    req.originalUserId = actingAs;
    next();
  }
);
app.use('/api/v2/shopping-list', shoppingListRoutes);
app.use(errorHandler);

const ID = '3f0c1a52-8d3e-4f4b-9a3a-1c2d3e4f5a6b';
const item = {
  id: ID,
  name: 'Oats',
  quantity: 2,
  unit: 'kg',
  note: null,
  is_checked: false,
  checked_at: null,
  created_at: '2026-10-25T00:00:00.000Z',
  updated_at: '2026-10-25T00:00:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  actingAs = 'test-user-id';
});

describe('shopping list routes', () => {
  it('lists the items', async () => {
    vi.mocked(listShoppingListItems).mockResolvedValue([item]);
    const res = await request(app).get('/api/v2/shopping-list');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [item] });
    expect(listShoppingListItems).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id'
    );
  });

  it('adds an item, trimming the name', async () => {
    vi.mocked(createShoppingListItem).mockResolvedValue(item);
    const res = await request(app)
      .post('/api/v2/shopping-list')
      .send({ name: '  Oats ', quantity: 2, unit: 'kg' });
    expect(res.status).toBe(201);
    expect(createShoppingListItem).toHaveBeenCalledWith(
      'test-user-id',
      { name: 'Oats', quantity: 2, unit: 'kg' },
      'test-user-id'
    );
  });

  it.each([
    ['a blank name', { name: '   ' }],
    ['a missing name', { quantity: 1 }],
    ['a zero quantity', { name: 'Oats', quantity: 0 }],
  ])('rejects %s on add', async (_label, body) => {
    const res = await request(app).post('/api/v2/shopping-list').send(body);
    expect(res.status).toBe(400);
    expect(createShoppingListItem).not.toHaveBeenCalled();
  });

  it('checks an item off', async () => {
    vi.mocked(updateShoppingListItem).mockResolvedValue({
      ...item,
      is_checked: true,
    });
    const res = await request(app)
      .patch(`/api/v2/shopping-list/${ID}`)
      .send({ is_checked: true });
    expect(res.status).toBe(200);
    expect(updateShoppingListItem).toHaveBeenCalledWith(
      'test-user-id',
      ID,
      { is_checked: true },
      'test-user-id'
    );
  });

  it('lets a quantity be cleared with null', async () => {
    vi.mocked(updateShoppingListItem).mockResolvedValue(item);
    const res = await request(app)
      .patch(`/api/v2/shopping-list/${ID}`)
      .send({ quantity: null });
    expect(res.status).toBe(200);
  });

  it('rejects an empty update', async () => {
    const res = await request(app)
      .patch(`/api/v2/shopping-list/${ID}`)
      .send({});
    expect(res.status).toBe(400);
    expect(updateShoppingListItem).not.toHaveBeenCalled();
  });

  it('answers 404 for an item that is not the person’s', async () => {
    vi.mocked(updateShoppingListItem).mockResolvedValue(null);
    vi.mocked(deleteShoppingListItem).mockResolvedValue(false);
    const patch = await request(app)
      .patch(`/api/v2/shopping-list/${ID}`)
      .send({ is_checked: true });
    const del = await request(app).delete(`/api/v2/shopping-list/${ID}`);
    const bad = await request(app).delete('/api/v2/shopping-list/not-a-uuid');
    expect([patch.status, del.status, bad.status]).toEqual([404, 404, 404]);
  });

  it('removes an item', async () => {
    vi.mocked(deleteShoppingListItem).mockResolvedValue(true);
    const res = await request(app).delete(`/api/v2/shopping-list/${ID}`);
    expect(res.status).toBe(204);
  });

  it('clears the checked items', async () => {
    vi.mocked(clearCheckedShoppingListItems).mockResolvedValue(3);
    const res = await request(app).delete('/api/v2/shopping-list/checked');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 3 });
    expect(deleteShoppingListItem).not.toHaveBeenCalled();
  });

  it('refuses a delegated context', async () => {
    actingAs = 'someone-else';
    const res = await request(app).get('/api/v2/shopping-list');
    expect(res.status).toBe(403);
    expect(listShoppingListItems).not.toHaveBeenCalled();
  });
});
