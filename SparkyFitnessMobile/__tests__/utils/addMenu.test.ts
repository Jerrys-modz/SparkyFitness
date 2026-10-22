import {
  ADD_MENU_ITEM_KEYS,
  DEFAULT_ADD_MENU_CARDS,
} from '../../src/constants/addMenuItems';
import {
  mergeRowOrder,
  placeInCardSlot,
  resolveAddMenuCards,
  rowKeys,
} from '../../src/utils/addMenu';

describe('addMenu', () => {
  describe('resolveAddMenuCards', () => {
    it('returns the default cards when nothing is saved', () => {
      expect(resolveAddMenuCards(undefined)).toEqual(DEFAULT_ADD_MENU_CARDS);
    });

    it('drops unknown and repeated items and fills the gaps', () => {
      expect(resolveAddMenuCards(['mood', 'nonsense', 'mood', 'food'])).toEqual(
        ['mood', 'food', 'exercise', 'measurements']
      );
    });

    it('keeps only four', () => {
      expect(
        resolveAddMenuCards([
          'mood',
          'food',
          'exercise',
          'scanFood',
          'syncHealth',
        ])
      ).toEqual(['mood', 'food', 'exercise', 'scanFood']);
    });
  });

  describe('placeInCardSlot', () => {
    const cards = ['food', 'exercise', 'measurements', 'scanFood'] as const;

    it('swaps with the slot an item already holds', () => {
      expect(placeInCardSlot(cards, 0, 'scanFood')).toEqual([
        'scanFood',
        'exercise',
        'measurements',
        'food',
      ]);
    });

    it('lets a row item take a slot, sending the old card to the rows', () => {
      const next = placeInCardSlot(cards, 1, 'mood');
      expect(next).toEqual(['food', 'mood', 'measurements', 'scanFood']);
      expect(rowKeys(ADD_MENU_ITEM_KEYS, next)).toContain('exercise');
    });

    it('does nothing when the slot already holds the item', () => {
      expect(placeInCardSlot(cards, 0, 'food')).toEqual([...cards]);
    });
  });

  describe('rows', () => {
    const cards = [...DEFAULT_ADD_MENU_CARDS];

    it('lists everything not on a card, in order', () => {
      expect(rowKeys(ADD_MENU_ITEM_KEYS, cards)).toEqual(
        ADD_MENU_ITEM_KEYS.filter((key) => !cards.includes(key))
      );
    });

    it('keeps card items in place when the rows are reordered', () => {
      const rows = rowKeys(ADD_MENU_ITEM_KEYS, cards);
      const reordered = [...rows].reverse();
      const merged = mergeRowOrder(ADD_MENU_ITEM_KEYS, cards, reordered);
      expect(merged.slice(0, 4)).toEqual(cards);
      expect(rowKeys(merged, cards)).toEqual(reordered);
    });
  });
});
