import {
  buildChatContext,
  buildChatTranscript,
  MAX_CHAT_TURNS,
} from '../../src/services/onDeviceChat';

jest.mock('../../modules/on-device-nutrition', () => ({
  __esModule: true,
  default: null,
}));

describe('buildChatContext', () => {
  it('sums the food list against the goals', () => {
    const text = buildChatContext(
      {
        goals: { calories: 2000, protein: 150, carbs: 200, fat: 70 },
        foodEntries: [
          {
            meal_type: 'breakfast',
            food_name: 'Eggs',
            calories: 300,
            protein: 20,
            carbs: 2,
            fat: 20,
          },
          {
            meal_type: 'lunch',
            food_name: 'Rice',
            calories: 400,
            protein: 8,
            carbs: 80,
            fat: 2,
          },
        ],
        exerciseSessions: [{ name: 'Push' }],
        waterIntake: 500,
      } as never,
      '2026-10-03'
    );
    expect(text).toContain('700 eaten of a 2000 kcal goal');
    expect(text).toContain('Protein: 28 g of 150 g');
    expect(text).toContain('- breakfast: Eggs (300 kcal, 20 g protein)');
    expect(text).toContain('Workouts today: Push.');
    expect(text).toContain('Water: 500 ml');
  });

  it('says so when there is no diary data', () => {
    expect(buildChatContext(null, '2026-10-03')).toContain('No diary data');
  });
});

describe('buildChatTranscript', () => {
  it('keeps only the most recent turns, oldest first', () => {
    const turns = Array.from({ length: MAX_CHAT_TURNS + 3 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      text: `m${i}`,
    }));
    const out = buildChatTranscript(turns).split('\n');
    expect(out).toHaveLength(MAX_CHAT_TURNS);
    expect(out[0]).toBe('User: m3'.replace('User', 'Assistant'));
    expect(out[out.length - 1]).toContain(`m${MAX_CHAT_TURNS + 2}`);
  });
});
