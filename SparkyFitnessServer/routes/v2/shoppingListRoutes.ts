import express from 'express';
import { z } from 'zod';
import {
  createShoppingListItemBodySchema,
  updateShoppingListItemBodySchema,
} from '@workspace/shared';
import requireSelfActor from '../../middleware/requireSelfMiddleware.js';
import {
  clearCheckedShoppingListItems,
  createShoppingListItem,
  deleteShoppingListItem,
  listShoppingListItems,
  updateShoppingListItem,
} from '../../models/shoppingListRepository.js';

/**
 * A person's shopping list. Owner-only, like the run goals: a delegated
 * context is refused.
 */
const router = express.Router();

router.use(requireSelfActor);

const idSchema = z.uuid();

function invalidBody(res: express.Response, error: z.ZodError) {
  return res
    .status(400)
    .json({ error: 'Invalid request body', details: z.treeifyError(error) });
}

/**
 * @swagger
 * /v2/shopping-list:
 *   get:
 *     summary: Get the shopping list
 *     description: Unchecked items first (oldest first), then checked items (latest first).
 *     tags: [Shopping List]
 *     responses:
 *       200:
 *         description: The items on the list.
 *   post:
 *     summary: Add an item
 *     tags: [Shopping List]
 *     responses:
 *       201:
 *         description: The new item.
 *       400:
 *         description: Invalid body.
 * /v2/shopping-list/checked:
 *   delete:
 *     summary: Remove every checked item
 *     tags: [Shopping List]
 *     responses:
 *       200:
 *         description: How many items were removed.
 * /v2/shopping-list/{id}:
 *   patch:
 *     summary: Edit or check off an item
 *     description: Only fields present are changed; null clears quantity, unit or note.
 *     tags: [Shopping List]
 *     responses:
 *       200:
 *         description: The updated item.
 *       404:
 *         description: No such item.
 *   delete:
 *     summary: Remove an item
 *     tags: [Shopping List]
 *     responses:
 *       204:
 *         description: Removed.
 *       404:
 *         description: No such item.
 */
router.get('/', async (req, res, next) => {
  try {
    res.json({
      items: await listShoppingListItems(req.userId, req.authenticatedUserId),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = createShoppingListItemBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    res
      .status(201)
      .json(
        await createShoppingListItem(
          req.userId,
          parsed.data,
          req.authenticatedUserId
        )
      );
  } catch (error) {
    next(error);
  }
});

router.delete('/checked', async (req, res, next) => {
  try {
    res.json({
      deleted: await clearCheckedShoppingListItems(
        req.userId,
        req.authenticatedUserId
      ),
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return res.status(404).json({ error: 'Item not found' });
    const parsed = updateShoppingListItemBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const item = await updateShoppingListItem(
      req.userId,
      id.data,
      parsed.data,
      req.authenticatedUserId
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return res.status(404).json({ error: 'Item not found' });
    const removed = await deleteShoppingListItem(
      req.userId,
      id.data,
      req.authenticatedUserId
    );
    if (!removed) return res.status(404).json({ error: 'Item not found' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
