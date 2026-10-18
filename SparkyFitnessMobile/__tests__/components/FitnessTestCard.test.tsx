import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { evaluateFitnessTest } from '@workspace/shared';
import FitnessTestCard, {
  FitnessTestFinishedCard,
} from '../../src/components/recording/FitnessTestCard';

describe('FitnessTestCard', () => {
  it('counts down the distance to the 5K mark in the display unit', () => {
    render(
      <FitnessTestCard
        type="5k"
        activeSeconds={600}
        distanceMeters={3000}
        unit="km"
      />
    );
    expect(screen.getByTestId('fitness-test-guidance').props.children).toBe(
      'Run evenly and hard. 2.00 km to go until 5 km.'
    );
  });

  it('counts the 5K down in miles', () => {
    render(
      <FitnessTestCard
        type="5k"
        activeSeconds={600}
        distanceMeters={3000}
        unit="miles"
      />
    );
    expect(screen.getByTestId('fitness-test-guidance').props.children).toBe(
      'Run evenly and hard. 1.24 mi to go until 5 km.'
    );
  });

  it('counts down the 12 minutes of a Cooper test', () => {
    render(
      <FitnessTestCard
        type="cooper"
        activeSeconds={300}
        distanceMeters={1000}
        unit="km"
      />
    );
    expect(screen.getByTestId('fitness-test-guidance').props.children).toBe(
      'Cover as much distance as you can. 7:00 left.'
    );
  });

  it('tells the 30-minute runner when the last 20 minutes start and count', () => {
    const { rerender } = render(
      <FitnessTestCard
        type="30min"
        activeSeconds={240}
        distanceMeters={900}
        unit="km"
      />
    );
    expect(screen.getByTestId('fitness-test-guidance').props.children).toBe(
      'Settle into a hard, steady effort. The last 20 minutes start in 6:00.'
    );
    rerender(
      <FitnessTestCard
        type="30min"
        activeSeconds={900}
        distanceMeters={3500}
        unit="km"
      />
    );
    expect(screen.getByTestId('fitness-test-guidance').props.children).toBe(
      'Hold this pace: the last 20 minutes set your threshold. 15:00 left.'
    );
  });

  it('says when the test is complete', () => {
    render(
      <FitnessTestCard
        type="cooper"
        activeSeconds={725}
        distanceMeters={3000}
        unit="km"
      />
    );
    expect(screen.getByTestId('fitness-test-guidance').props.children).toBe(
      'Test complete. Slow down and tap Finish.'
    );
  });
});

describe('FitnessTestFinishedCard', () => {
  it('shows the threshold pace the test will save', () => {
    const outcome = evaluateFitnessTest({
      type: '5k',
      distanceMeters: 5000,
      durationSeconds: 1500,
    });
    render(<FitnessTestFinishedCard type="5k" outcome={outcome} unit="km" />);
    expect(
      screen.getByText(/Threshold pace \d:\d\d\/km, about 25:00 for 5K/)
    ).toBeTruthy();
  });

  it('says a test stopped early is saved as an ordinary run', () => {
    render(<FitnessTestFinishedCard type="5k" outcome={null} unit="km" />);
    expect(screen.getByText(/saved as an ordinary run/)).toBeTruthy();
  });
});
