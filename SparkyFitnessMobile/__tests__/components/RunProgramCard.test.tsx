import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import RunProgramCard from '../../src/components/recording/RunProgramCard';
import { programStatus } from '@workspace/shared';

const handlers = () => ({
  programId: 'beginner5k',
  onChooseProgram: jest.fn(),
  now: Date.now(),
  reminders: { days: [] as number[], hour: 7 },
  onReminders: jest.fn(),
  onPickWorkout: jest.fn(),
  onToggle: jest.fn(),
  onSelect: jest.fn(),
  onRestart: jest.fn(),
  onSkip: jest.fn(),
});

const active = (next: number) =>
  programStatus({ programId: 'beginner5k', next })!;

describe('RunProgramCard', () => {
  it('is off by default and offers a switch, with the program described', () => {
    const h = handlers();
    render(
      <RunProgramCard
        status={null}
        loaded
        selected={false}
        enabled={false}
        {...h}
      />
    );
    expect(screen.getByText(/nine weeks, three runs a week/)).toBeTruthy();
    expect(
      screen.getByText(
        /Week 1: workouts of .* minutes\. Builds to \d+ minutes of running/
      )
    ).toBeTruthy();
    expect(screen.queryByText('Do this workout')).toBeNull();
    fireEvent(
      screen.getByLabelText('Use a training program'),
      'valueChange',
      true
    );
    expect(h.onToggle).toHaveBeenCalledWith(true);
  });

  it('shows nothing until the stored place has loaded', () => {
    render(
      <RunProgramCard
        status={null}
        loaded={false}
        selected={false}
        enabled={false}
        {...handlers()}
      />
    );
    expect(screen.queryByLabelText('Use a training program')).toBeNull();
  });

  it('keeps the place when switched off and says where it is paused', () => {
    render(
      <RunProgramCard
        status={active(4)}
        loaded
        selected={false}
        enabled={false}
        {...handlers()}
      />
    );
    expect(screen.getByText(/paused at 4 of 27 workouts/)).toBeTruthy();
    expect(screen.queryByText('Skip')).toBeNull();
  });

  it('shows the workout that is due and lets it be chosen, skipped or restarted', () => {
    const h = handlers();
    render(
      <RunProgramCard
        status={active(4)}
        loaded
        selected={false}
        enabled
        {...h}
      />
    );
    expect(screen.getByText('Beginner 5K · Week 2, run 2')).toBeTruthy();
    expect(screen.getByText(/Workout 4 of 27 done/)).toBeTruthy();
    fireEvent.press(screen.getByText('Do this workout'));
    fireEvent.press(screen.getByText('Skip'));
    fireEvent.press(screen.getByText('Start over'));
    expect(h.onSelect).toHaveBeenCalled();
    expect(h.onSkip).toHaveBeenCalled();
    expect(h.onRestart).toHaveBeenCalled();
  });

  it('says so when chosen and when the program is finished', () => {
    const { rerender } = render(
      <RunProgramCard
        status={active(4)}
        loaded
        selected
        enabled
        {...handlers()}
      />
    );
    expect(screen.getByText('Using this workout')).toBeTruthy();
    rerender(
      <RunProgramCard
        status={active(27)}
        loaded
        selected={false}
        enabled
        {...handlers()}
      />
    );
    expect(screen.getByText('Beginner 5K complete')).toBeTruthy();
    expect(screen.getByText('Start again')).toBeTruthy();
  });
});

describe('run reminders', () => {
  it('toggles a weekday', () => {
    const onReminders = jest.fn();
    const { rerender } = render(
      <RunProgramCard
        {...handlers()}
        onReminders={onReminders}
        status={active(1)}
        loaded
        selected={false}
        enabled
      />
    );
    fireEvent.press(screen.getByLabelText('Monday'));
    expect(onReminders).toHaveBeenCalledWith({ days: [1], hour: 7 });

    rerender(
      <RunProgramCard
        {...handlers()}
        reminders={{ days: [1], hour: 7 }}
        onReminders={onReminders}
        status={active(1)}
        loaded
        selected={false}
        enabled
      />
    );
    fireEvent.press(screen.getByLabelText('Monday'));
    expect(onReminders).toHaveBeenLastCalledWith({ days: [], hour: 7 });
  });
});

describe('recent changes', () => {
  const base = {
    programId: 'beginner5k',
    onChooseProgram: jest.fn(),
    reminders: { days: [] as number[], hour: 7 },
    onReminders: jest.fn(),
    onPickWorkout: jest.fn(),
    onToggle: jest.fn(),
    onSelect: jest.fn(),
    onRestart: jest.fn(),
    onSkip: jest.fn(),
    status: programStatus({ programId: 'beginner5k', next: 2 })!,
    loaded: true,
    selected: false,
    enabled: true,
    now: Date.now(),
  };

  it('says what Sparky changed, while it is recent', () => {
    render(
      <RunProgramCard
        {...base}
        lastAdjustment={{
          at: new Date().toISOString(),
          summary: 'Eased the running in the next 2 workouts by 20%.',
          source: 'assistant',
        }}
      />
    );
    expect(
      screen.getByText(/Sparky changed your plan on .*: Eased the running/)
    ).toBeTruthy();
  });

  it('stays quiet about an old change', () => {
    render(
      <RunProgramCard
        {...base}
        lastAdjustment={{
          at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
          summary: 'Repeating week 2.',
          source: 'assistant',
        }}
      />
    );
    expect(screen.queryByText(/Repeating week 2/)).toBeNull();
  });
});

describe('choosing a program', () => {
  it('describes the program picked while it is switched off', () => {
    render(
      <RunProgramCard
        {...handlers()}
        programId="halfMarathon"
        status={null}
        loaded
        selected={false}
        enabled={false}
      />
    );
    expect(screen.getByText(/Half marathon: twelve weeks/)).toBeTruthy();
  });

  it('names the running program and offers to change it', () => {
    render(
      <RunProgramCard
        {...handlers()}
        status={programStatus({ programId: 'marathon', next: 5 })!}
        programId="marathon"
        loaded
        selected={false}
        enabled
      />
    );
    expect(screen.getByText('Marathon · Week 2, run 2')).toBeTruthy();
    expect(screen.getByText('Change program')).toBeTruthy();
  });
});
