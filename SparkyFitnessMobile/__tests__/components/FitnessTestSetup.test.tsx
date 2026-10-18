import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import FitnessTestSetup from '../../src/components/recording/FitnessTestSetup';

const props = (overrides = {}) => ({
  type: '5k' as const,
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
