import {
  ADD_MENU_CARD_COUNT,
  ADD_MENU_ITEM_KEYS,
  DEFAULT_ADD_MENU_CARDS,
  type AddMenuItemKey,
} from '../constants/addMenuItems';
import { resolveKeyOrder } from './reorderUtils';

/**
 * The saved card slots, made safe to use: unknown and repeated items are
 * dropped, and any slot left empty is filled with the first default card not
 * already placed, so there are always four distinct cards.
 */
export function resolveAddMenuCards(
  saved: readonly string[] | undefined
): AddMenuItemKey[] {
  const isKey = (value: string): value is AddMenuItemKey =>
    (ADD_MENU_ITEM_KEYS as readonly string[]).includes(value);
  const cards: AddMenuItemKey[] = [];
  for (const key of saved ?? []) {
    if (cards.length >= ADD_MENU_CARD_COUNT) break;
    if (isKey(key) && !cards.includes(key)) cards.push(key);
  }
  for (const key of [...DEFAULT_ADD_MENU_CARDS, ...ADD_MENU_ITEM_KEYS]) {
    if (cards.length >= ADD_MENU_CARD_COUNT) break;
    if (!cards.includes(key)) cards.push(key);
  }
  return cards;
}

/**
 * Puts `key` in a card slot. If it was already in another slot the two swap, so
 * nothing is ever in two places; otherwise the item it replaces drops to the
 * rows.
 */
export function placeInCardSlot(
  cards: readonly AddMenuItemKey[],
  slotIndex: number,
  key: AddMenuItemKey
): AddMenuItemKey[] {
  const next = [...cards];
  const previous = next[slotIndex];
  if (previous === undefined || previous === key) return next;
  const from = next.indexOf(key);
  if (from >= 0) next[from] = previous;
  next[slotIndex] = key;
  return next;
}

/** The items not in a card slot, in the order the rows show them. */
export function rowKeys(
  order: readonly string[],
  cards: readonly AddMenuItemKey[]
): AddMenuItemKey[] {
  return resolveKeyOrder(order, ADD_MENU_ITEM_KEYS).filter(
    (key) => !cards.includes(key)
  );
}

/**
 * The full saved order after the rows were rearranged: the row items take the
 * places the row items held, in their new order, and the card items stay where
 * they were.
 */
export function mergeRowOrder(
  order: readonly string[],
  cards: readonly AddMenuItemKey[],
  reorderedRows: readonly AddMenuItemKey[]
): AddMenuItemKey[] {
  const full = resolveKeyOrder(order, ADD_MENU_ITEM_KEYS);
  const queue = [...reorderedRows];
  return full.map((key) =>
    cards.includes(key) ? key : (queue.shift() ?? key)
  );
}
