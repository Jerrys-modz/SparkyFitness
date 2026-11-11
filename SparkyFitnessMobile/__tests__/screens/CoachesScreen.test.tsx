import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import CoachesScreen from '../../src/screens/CoachesScreen';
import { useCoaches } from '../../src/hooks/useCoaches';

jest.mock('../../src/hooks/useCoaches', () => ({ useCoaches: jest.fn() }));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUseCoaches = useCoaches as jest.MockedFunction<typeof useCoaches>;
const saveMutate = jest.fn();
const removeMutate = jest.fn();

const marathon = {
  id: 'd3ebfc08-7f2e-4736-8b08-b8a0cbac2d17',
  name: 'Marathon coach',
  description: 'For my spring race',
  system_prompt: 'Focus on my marathon build.',
  tool_categories: ['exercise' as const, 'reports' as const],
  created_at: '2026-11-11T00:00:00.000Z',
  updated_at: '2026-11-11T00:00:00.000Z',
};

function mockCoaches(coaches = [marathon]) {
  mockUseCoaches.mockReturnValue({
    coaches,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    save: { mutate: saveMutate, isPending: false },
    remove: { mutate: removeMutate, isPending: false },
  } as unknown as ReturnType<typeof useCoaches>);
}

const props = {} as React.ComponentProps<typeof CoachesScreen>;

describe('CoachesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists the built-in coaches and the person’s own', () => {
    mockCoaches();
    const { getByText } = render(<CoachesScreen {...props} />);
    expect(getByText('Recovery Coach')).toBeTruthy();
    expect(getByText('Sleep and Recovery Coach')).toBeTruthy();
    expect(getByText('Marathon coach')).toBeTruthy();
    expect(getByText('For my spring race')).toBeTruthy();
  });

  it('creates a coach with its tools in canonical order', () => {
    mockCoaches([]);
    const { getByText, getByLabelText } = render(<CoachesScreen {...props} />);
    fireEvent.press(getByText('Add a coach'));
    fireEvent.changeText(getByLabelText('Name'), ' Night owl ');
    fireEvent.changeText(getByLabelText('Instructions'), 'Keep it short.');
    // Starts with Food & Water and Exercise; add Goals, drop Exercise.
    fireEvent(getByLabelText('Goals'), 'valueChange', true);
    fireEvent(getByLabelText('Exercise'), 'valueChange', false);
    fireEvent.press(getByText('Save'));

    expect(saveMutate).toHaveBeenCalledWith(
      {
        id: null,
        body: {
          name: 'Night owl',
          description: null,
          system_prompt: 'Keep it short.',
          tool_categories: ['food', 'goals'],
        },
      },
      expect.anything()
    );
  });

  it('does not save a coach without a name', () => {
    mockCoaches([]);
    const { getByText, getByLabelText } = render(<CoachesScreen {...props} />);
    fireEvent.press(getByText('Add a coach'));
    fireEvent.changeText(getByLabelText('Instructions'), 'Keep it short.');
    fireEvent.press(getByText('Save'));
    expect(saveMutate).not.toHaveBeenCalled();
  });

  it('edits an existing coach by id', () => {
    mockCoaches();
    const { getByText, getByLabelText } = render(<CoachesScreen {...props} />);
    fireEvent.press(getByText('Edit'));
    fireEvent.changeText(getByLabelText('Name'), 'Half marathon coach');
    fireEvent.press(getByText('Save'));
    expect(saveMutate).toHaveBeenCalledWith(
      {
        id: marathon.id,
        body: expect.objectContaining({
          name: 'Half marathon coach',
          tool_categories: ['exercise', 'reports'],
        }),
      },
      expect.anything()
    );
  });
});
