import {
  buildChatContext,
  buildChatTranscript,
  MAX_CHAT_TURNS,
} from '../../src/services/onDeviceChat';

jest.mock('../../modules/on-device-nutrition', () => ({
  __esModule: true,
  default: null,
}));

const summary = (overrides = {}) =>
  ({
    calorieBalance: { goal: 2000, eaten: 2640, burned: 770, remaining: 130 },
    protein: { consumed: 170, goal: 150 },
    carbs: { consumed: 100, goal: 250 },
    fat: { consumed: 60, goal: 0 },
    waterConsumed: 500,
    foodEntries: [
      { meal_type: 'breakfast', food_name: 'Eggs', calories: 300, protein: 20 },
    ],
    exerciseEntries: [{ name: 'Push' }],
    ...overrides,
  }) as never;

describe('buildChatContext', () => {
  it('states what is left as a finished number, counting exercise', () => {
    const text = buildChatContext(summary(), '2026-10-02');
    expect(text).toContain(
      'Calorie goal: 2000 kcal. Eaten: 2640 kcal. Burned by exercise: 770 kcal.'
    );
    expect(text).toContain('Calories remaining: 130 kcal.');
  });

  it('says how far over the goal when nothing is left', () => {
    const text = buildChatContext(
      summary({
        calorieBalance: { goal: 2000, eaten: 2640, burned: 0, remaining: -640 },
      }),
      '2026-10-02'
    );
    expect(text).toContain(
      'Calories remaining: 0 kcal (over the goal by 640 kcal).'
    );
  });

  it('works out macro differences and handles a missing goal', () => {
    const text = buildChatContext(summary(), '2026-10-02');
    expect(text).toContain('Protein: 170 g eaten, goal 150 g (20 g over).');
    expect(text).toContain('Carbs: 100 g eaten, goal 250 g (150 g left).');
    expect(text).toContain('Fat: 60 g eaten, no goal set.');
  });

  it('lists foods, water and workouts', () => {
    const text = buildChatContext(summary(), '2026-10-02');
    expect(text).toContain('- breakfast: Eggs (300 kcal, 20 g protein)');
    expect(text).toContain('Water: 500 ml.');
    expect(text).toContain('Workouts: Push.');
  });

  it('says so when there is no diary data', () => {
    expect(buildChatContext(null, '2026-10-02')).toContain('No diary data');
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

describe('buildChatTranscript limits', () => {
  it('keeps only the start of a long earlier turn', () => {
    const out = buildChatTranscript([
      { role: 'assistant', text: 'x'.repeat(5000) },
      { role: 'user', text: 'Hi' },
    ]);
    const [first] = out.split('\n');
    expect(first.length).toBeLessThan(450);
    expect(first.endsWith('…')).toBe(true);
    expect(out).toContain('User: Hi');
  });

  it("keeps less of an earlier assistant reply than of the user's message", () => {
    const out = buildChatTranscript([
      { role: 'user', text: 'u'.repeat(350) },
      { role: 'assistant', text: 'a'.repeat(350) },
      { role: 'user', text: 'Hi' },
    ]).split('\n');
    expect(out[0]).toHaveLength('User: '.length + 350);
    expect(out[1].length).toBeLessThanOrEqual('Assistant: '.length + 200);
    expect(out[1].endsWith('…')).toBe(true);
  });

  it('drops the oldest turns when the whole transcript is too long', () => {
    const turns = Array.from({ length: 8 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      text: `${i}`.repeat(390),
    }));
    const out = buildChatTranscript(turns);
    expect(out.length).toBeLessThanOrEqual(2400 + 400);
    expect(out).toContain('7777');
    expect(out).not.toContain('0000');
  });
});
