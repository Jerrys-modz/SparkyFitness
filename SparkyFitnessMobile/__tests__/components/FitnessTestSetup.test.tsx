import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import FitnessTestSetup from '../../src/components/recording/FitnessTestSetup';

const props = (overrides = {}) => ({
  type: '5k' as const,
  indoor: false,
  onIndoorChange: jest.fn(),
  audioCues: false,
  onAudioCuesChange: jest.fn(),
  busy: false,
  permissionProblem: null,
  onStart: jest.fn(),
  onOpenSettings: jest.fn(),
  ...overrides,
});

it('explains the chosen test and starts it', () => {
  const p = props({ type: 'cooper' });
  render(<FitnessTestSetup {...p} />);
  expect(screen.getByText('12-minute Cooper test')).toBeTruthy();
  expect(
    screen.getByText(/Cover as much distance as you can in 12 minutes/)
  ).toBeTruthy();
  expect(screen.getByText(/Warm up with 10 to 15 minutes/)).toBeTruthy();
  fireEvent.press(screen.getByTestId('fitness-test-start'));
  expect(p.onStart).toHaveBeenCalled();
});

it('describes each test differently', () => {
  const { rerender } = render(<FitnessTestSetup {...props({ type: '5k' })} />);
  expect(
    screen.getByText(/Run 5 km as fast as you can hold evenly/)
  ).toBeTruthy();
  rerender(<FitnessTestSetup {...props({ type: '30min' })} />);
  expect(screen.getByText(/average pace of the last 20 minutes/)).toBeTruthy();
});

it('switches voice cues', () => {
  const p = props();
  render(<FitnessTestSetup {...p} />);
  fireEvent(screen.getByTestId('fitness-test-audio-cues'), 'valueChange', true);
  expect(p.onAudioCuesChange).toHaveBeenCalledWith(true);
});

it('says why Start did nothing when location is refused', () => {
  const p = props({ permissionProblem: 'denied' });
  render(<FitnessTestSetup {...p} />);
  expect(screen.getByText(/needs location access/)).toBeTruthy();
  fireEvent.press(screen.getByText('Open Settings'));
  expect(p.onOpenSettings).toHaveBeenCalled();
});

describe('surface', () => {
  it('offers Outdoor (GPS) and Treadmill and reports the choice', () => {
    const p = props();
    render(<FitnessTestSetup {...p} />);
    fireEvent.press(screen.getByText('Treadmill'));
    expect(p.onIndoorChange).toHaveBeenCalledWith(true);
    fireEvent.press(screen.getByText('Outdoor (GPS)'));
    expect(p.onIndoorChange).toHaveBeenCalledWith(false);
  });

  it('explains the treadmill version', () => {
    render(<FitnessTestSetup {...props({ indoor: true })} />);
    expect(
      screen.getByText(/On a treadmill nothing is tracked by GPS/)
    ).toBeTruthy();
    expect(screen.queryByText(/Outdoors the test is recorded/)).toBeNull();
  });

  it('explains the outdoor version', () => {
    render(<FitnessTestSetup {...props()} />);
    expect(screen.getByText(/Outdoors the test is recorded/)).toBeTruthy();
  });

  it('says when the surface was suggested from the last test', () => {
    const { rerender } = render(<FitnessTestSetup {...props()} />);
    expect(screen.queryByText(/Suggested because your last test/)).toBeNull();
    rerender(<FitnessTestSetup {...props({ suggestedFromLast: true })} />);
    expect(screen.getByText(/Suggested because your last test/)).toBeTruthy();
  });
});

describe('recording a test on the watch', () => {
  const watchProps = (overrides = {}) =>
    props({
      recordWith: 'watch' as const,
      onRecordWithChange: jest.fn(),
      inclineText: '1',
      onInclineTextChange: jest.fn(),
      ...overrides,
    });

  it('offers the watch for a treadmill test too', () => {
    render(
      <FitnessTestSetup
        {...watchProps({ indoor: true, recordWith: 'phone' })}
      />
    );
    expect(screen.getByTestId('fitness-test-record-with')).toBeTruthy();
    expect(screen.queryByTestId('fitness-test-watch-incline')).toBeNull();
  });

  it('asks for the incline before a treadmill test starts on the watch', () => {
    const p = watchProps({ indoor: true });
    render(<FitnessTestSetup {...p} />);
    expect(screen.getByTestId('fitness-test-watch-incline')).toBeTruthy();
    expect(
      screen.getByText(/Your watch records the treadmill test/)
    ).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Treadmill incline (%)'), '2');
    expect(p.onInclineTextChange).toHaveBeenCalledWith('2');
  });

  it('has no incline field outdoors, and blocks Start on a bad incline', () => {
    const { rerender } = render(<FitnessTestSetup {...watchProps()} />);
    expect(screen.queryByTestId('fitness-test-watch-incline')).toBeNull();
    const p = watchProps({ indoor: true, inclineInvalid: true });
    rerender(<FitnessTestSetup {...p} />);
    expect(screen.getByText('Enter an incline from 0 to 15.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('fitness-test-start'));
    expect(p.onStart).not.toHaveBeenCalled();
  });
});
