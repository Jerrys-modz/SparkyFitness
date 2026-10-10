import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import RunProgramCard from '../../src/components/recording/RunProgramCard';
import { programStatus } from '../../src/utils/runPrograms';

const handlers = () => ({
  onSelect: jest.fn(),
  onStart: jest.fn(),
  onSkip: jest.fn(),
  onStop: jest.fn(),
});

describe('RunProgramCard', () => {
  it('offers to start when no program is active', () => {
    const h = handlers();
    render(<RunProgramCard status={null} loaded selected={false} {...h} />);
    fireEvent.press(screen.getByText('Start Couch to 5K'));
    expect(h.onStart).toHaveBeenCalled();
  });

  it('shows nothing until the stored place has loaded', () => {
    render(
      <RunProgramCard
        status={null}
        loaded={false}
        selected={false}
        {...handlers()}
      />
    );
    expect(screen.queryByText('Start Couch to 5K')).toBeNull();
  });

  it('shows the workout that is due and lets it be chosen, skipped or left', () => {
    const h = handlers();
    const status = programStatus({ programId: 'couchTo5k', next: 4 })!;
    render(<RunProgramCard status={status} loaded selected={false} {...h} />);
    expect(screen.getByText('Couch to 5K · Week 2, run 2')).toBeTruthy();
    expect(screen.getByText(/Workout 4 of 27 done/)).toBeTruthy();
    fireEvent.press(screen.getByText('Do this workout'));
    fireEvent.press(screen.getByText('Skip'));
    fireEvent.press(screen.getByText('Leave program'));
    expect(h.onSelect).toHaveBeenCalled();
    expect(h.onSkip).toHaveBeenCalled();
    expect(h.onStop).toHaveBeenCalled();
  });

  it('says so when chosen and when the program is finished', () => {
    const status = programStatus({ programId: 'couchTo5k', next: 4 })!;
    const { rerender } = render(
      <RunProgramCard status={status} loaded selected {...handlers()} />
    );
    expect(screen.getByText('Using this workout')).toBeTruthy();
    rerender(
      <RunProgramCard
        status={programStatus({ programId: 'couchTo5k', next: 27 })!}
        loaded
        selected={false}
        {...handlers()}
      />
    );
    expect(screen.getByText('Couch to 5K complete')).toBeTruthy();
    expect(screen.getByText('Start again')).toBeTruthy();
  });
});
