import { startableWorkoutsForWatch } from '../../src/hooks/useWatchCheckInBridge';

describe('startableWorkoutsForWatch', () => {
  it('sends named presets that have exercises, in name order', () => {
    expect(
      startableWorkoutsForWatch([
        { id: 2, name: 'Pull', exercises: [{}] },
        { id: 1, name: '  ', exercises: [{}] },
        { id: 3, name: 'Legs', exercises: [] },
        { id: 4, name: 'Push', exercises: [{}] },
      ])
    ).toEqual([
      { presetId: '2', name: 'Pull' },
      { presetId: '4', name: 'Push' },
    ]);
  });
});
